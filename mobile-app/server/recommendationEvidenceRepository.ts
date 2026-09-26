import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { RecommendationEvent, RecommendationEventInput } from '@/types/Personalization';

export interface SessionCandidate {
  barcode: string;
  deterministicScore: number;
}
export interface SessionCreation {
  profileId: string;
  originalBarcode: string;
  candidates: SessionCandidate[];
}
export interface RecommendationSessionStore {
  create(uid: string, input: SessionCreation): Promise<string>;
}
export type EventIngestionOutcome = 'stored' | 'duplicate' | 'unavailable' | 'conflict';

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const pairs = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${pairs.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

type StoredSession = {
  sessionId: string;
  profileId: string;
  originalBarcode: string;
  candidates: SessionCandidate[];
  rankingMode: 'deterministic';
  modelVersion: 'deterministic-v1';
  createdAt: string;
  expiresAt: string;
  ttlAt: Timestamp;
};

export class FirestoreRecommendationEvidenceRepository implements RecommendationSessionStore {
  constructor(private readonly firestore: Firestore, private readonly now: () => number = Date.now) {}

  private profile(uid: string, profileId: string) {
    return this.firestore.collection('USERS').doc(uid).collection('PROFILES').doc(profileId);
  }

  async create(uid: string, input: SessionCreation): Promise<string> {
    const profile = await this.profile(uid, input.profileId).get();
    const profileData = profile.data();
    if (!profile.exists || profileData?.status === false ||
        (profileData?.userId != null && profileData.userId !== uid)) {
      throw new Error('Profile unavailable.');
    }
    if (input.candidates.length < 1 || input.candidates.length > 20) throw new Error('Invalid session.');
    const sessionId = randomUUID();
    const createdAt = this.now();
    const session: StoredSession = {
      sessionId, profileId: input.profileId, originalBarcode: input.originalBarcode,
      candidates: input.candidates, rankingMode: 'deterministic', modelVersion: 'deterministic-v1',
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(createdAt + SESSION_LIFETIME_MS).toISOString(),
      ttlAt: Timestamp.fromMillis(createdAt + SESSION_LIFETIME_MS),
    };
    await this.profile(uid, input.profileId).collection('RECOMMENDATION_SESSIONS').doc(sessionId).create(session);
    return sessionId;
  }

  async ingest(uid: string, input: RecommendationEventInput): Promise<EventIngestionOutcome> {
    const profileRef = this.profile(uid, input.profileId);
    const sessionRef = profileRef.collection('RECOMMENDATION_SESSIONS').doc(input.recommendationSessionId);
    const eventRef = profileRef.collection('RECOMMENDATION_EVENTS').doc(input.eventId);
    const now = this.now();
    return this.firestore.runTransaction(async transaction => {
      const [profile, sessionSnapshot, existing] = await Promise.all([
        transaction.get(profileRef), transaction.get(sessionRef), transaction.get(eventRef),
      ]);
      const profileData = profile.data();
      const session = sessionSnapshot.data() as StoredSession | undefined;
      if (!profile.exists || profileData?.status === false ||
          (profileData?.userId != null && profileData.userId !== uid) || !sessionSnapshot.exists || !session ||
          session.profileId !== input.profileId || session.sessionId !== input.recommendationSessionId ||
          session.originalBarcode !== input.originalBarcode ||
          !session.candidates.some(candidate => candidate.barcode === input.candidateBarcode)) {
        return 'unavailable';
      }
      const child = String(profileData?.relationship ?? '').toLowerCase() === 'child' ||
        (typeof profileData?.age === 'number' && profileData.age < 18);
      if (child && profileData?.recommendationEvidenceConsent !== true) return 'unavailable';
      const createdAt = Date.parse(session.createdAt);
      const expiresAt = Date.parse(session.expiresAt);
      const occurredAt = Date.parse(input.occurredAt);
      if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) ||
          now > expiresAt || occurredAt < createdAt - CLOCK_SKEW_MS ||
          occurredAt > Math.min(now + CLOCK_SKEW_MS, expiresAt)) return 'unavailable';

      if (existing.exists) {
        const stored = existing.data()?.event as RecommendationEvent | undefined;
        const original = stored ? { ...stored } as Partial<RecommendationEvent> : null;
        if (original) delete original.receivedAt;
        return stableJson(original) === stableJson(input) ? 'duplicate' : 'conflict';
      }
      const event: RecommendationEvent = { ...input, receivedAt: new Date(now).toISOString() };
      const candidate = session.candidates.find(item => item.barcode === input.candidateBarcode)!;
      transaction.create(eventRef, {
        event,
        serverMetadata: {
          rankingMode: session.rankingMode,
          modelVersion: session.modelVersion,
          deterministicScore: candidate.deterministicScore,
        },
        expiresAt: new Date(now + EVENT_RETENTION_MS).toISOString(),
        ttlAt: Timestamp.fromMillis(now + EVENT_RETENTION_MS),
      });
      return 'stored';
    });
  }
}
