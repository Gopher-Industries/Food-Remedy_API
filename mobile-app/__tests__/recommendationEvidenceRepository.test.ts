import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreRecommendationEvidenceRepository } from '@/server/recommendationEvidenceRepository';
import type { RecommendationEventInput } from '@/types/Personalization';

const nowIso = '2026-09-26T00:00:00.000Z';
const now = Date.parse(nowIso);

function fakeFirestore() {
  const rows = new Map<string, Record<string, unknown>>();
  const reference = (path: string): any => ({
    path,
    collection(name: string) { return collection(`${path}/${name}`); },
    async get() { return snapshot(path); },
    async create(value: Record<string, unknown>) { if (rows.has(path)) throw Error('exists'); rows.set(path, value); },
  });
  const collection = (path: string): any => ({ doc(id: string) { return reference(`${path}/${id}`); } });
  const snapshot = (path: string) => ({ exists: rows.has(path), data: () => rows.get(path) });
  const firestore = {
    collection,
    async runTransaction<T>(work: (transaction: any) => Promise<T>): Promise<T> {
      return work({
        get: async (ref: { path: string }) => snapshot(ref.path),
        create: (ref: { path: string }, value: Record<string, unknown>) => { rows.set(ref.path, value); },
      });
    },
  } as unknown as Firestore;
  return { rows, firestore };
}

function input(sessionId: string): RecommendationEventInput {
  return {
    schemaVersion: '1.0.0', eventId: 'event_1', profileId: 'self',
    recommendationSessionId: sessionId, originalBarcode: '12345678',
    candidateBarcode: '87654321', action: 'thumbs_up', occurredAt: nowIso,
  };
}

describe('BE060 authoritative recommendation evidence', () => {
  it('stores valid owned events once and derives ranking metadata from the session', async () => {
    const { rows, firestore } = fakeFirestore();
    rows.set('USERS/owner/PROFILES/self', { status: true, relationship: 'Self' });
    const repository = new FirestoreRecommendationEvidenceRepository(firestore, () => now);
    const sessionId = await repository.create('owner', {
      profileId: 'self', originalBarcode: '12345678',
      candidates: [{ barcode: '87654321', deterministicScore: 0.82 }],
    });
    expect(await repository.ingest('owner', input(sessionId))).toBe('stored');
    expect(await repository.ingest('owner', { ...input(sessionId) })).toBe('duplicate');
    expect(await repository.ingest('owner', { ...input(sessionId), action: 'opened' })).toBe('conflict');
    const stored = rows.get('USERS/owner/PROFILES/self/RECOMMENDATION_EVENTS/event_1')!;
    expect(stored.event).toEqual({ ...input(sessionId), receivedAt: nowIso });
    expect(stored.serverMetadata).toEqual({
      rankingMode: 'deterministic', modelVersion: 'deterministic-v1', deterministicScore: 0.82,
    });
    expect(JSON.stringify(stored)).not.toContain('allerg');
  });

  it('denies foreign profiles, fabricated sessions and unissued candidates uniformly', async () => {
    const { rows, firestore } = fakeFirestore();
    rows.set('USERS/owner/PROFILES/self', { status: true, relationship: 'Self' });
    const repository = new FirestoreRecommendationEvidenceRepository(firestore, () => now);
    const sessionId = await repository.create('owner', {
      profileId: 'self', originalBarcode: '12345678',
      candidates: [{ barcode: '87654321', deterministicScore: 0.82 }],
    });
    expect(await repository.ingest('attacker', input(sessionId))).toBe('unavailable');
    expect(await repository.ingest('owner', input('fabricated'))).toBe('unavailable');
    expect(await repository.ingest('owner', { ...input(sessionId), candidateBarcode: '99999999' })).toBe('unavailable');
    expect([...rows.keys()].filter(key => key.includes('RECOMMENDATION_EVENTS'))).toHaveLength(0);
  });

  it('requires child consent and rejects expired sessions', async () => {
    const { rows, firestore } = fakeFirestore();
    const path = 'USERS/owner/PROFILES/child';
    rows.set(path, { status: true, relationship: 'Child', age: 9 });
    const repository = new FirestoreRecommendationEvidenceRepository(firestore, () => now);
    const sessionId = await repository.create('owner', {
      profileId: 'child', originalBarcode: '12345678',
      candidates: [{ barcode: '87654321', deterministicScore: 0.82 }],
    });
    expect(await repository.ingest('owner', { ...input(sessionId), profileId: 'child' })).toBe('unavailable');
    rows.set(path, { status: true, relationship: 'Child', age: 9, recommendationEvidenceConsent: true });
    expect(await repository.ingest('owner', { ...input(sessionId), profileId: 'child' })).toBe('stored');
    const later = new FirestoreRecommendationEvidenceRepository(firestore, () => now + 8 * 24 * 60 * 60 * 1000);
    expect(await later.ingest('owner', { ...input(sessionId), profileId: 'child', eventId: 'event_2' })).toBe('unavailable');
  });
});
