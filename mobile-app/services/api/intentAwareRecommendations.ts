import { v4 as uuidv4 } from 'uuid';
import { auth } from '@/config/firebaseConfig';
import { initialiseSQLiteDatabase } from '@/config/sqlConfig';
import { validPersonalizationId } from '@/services/personalizationValidation';
import { queueRecommendationEvent } from '@/services/sqlDatabase/recommendationEvents.dao';
import { drainRecommendationEvents } from '@/services/sync/syncRecommendationEvents';
import { PERSONALIZATION_SCHEMA_VERSION, type RecommendationAction, type RejectionReason } from '@/types/Personalization';
import type { ProductSubstitutionV2Response } from '@/server/productSubstitutionV2';

const BARCODE = /^[0-9]{8,14}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const REQUEST_TIMEOUT_MS = 6_000;

export interface IntentAwareRequest {
  barcode: string;
  profileId: string;
  limit?: number;
  /** One-off context; never written to SQLite or an event. */
  intention?: string;
  /** Choose this OR a one-off intention. The server checks ownership. */
  savedIntentId?: string;
}

export interface RecommendationForDisplay {
  barcode: string;
  productName: string;
  brand: string | null;
  /** Nutrition evidence; independent of contextual fit. */
  nutriscoreGrade: string;
  /** Server safety result; semantic fit must never change it. */
  safetyRating: 'green' | 'grey';
  reasonCodes: string[];
  contextualFit: 'applied' | 'not_applied';
}

export interface IntentAwareResult {
  status: ProductSubstitutionV2Response['status'];
  targetProduct: ProductSubstitutionV2Response['targetProduct'];
  substitutions: RecommendationForDisplay[];
  rankingMode: ProductSubstitutionV2Response['rankingMode'];
  rankingReasonCode: ProductSubstitutionV2Response['rankingReasonCode'];
  emptyStateReason: ProductSubstitutionV2Response['emptyStateReason'];
  recommendationSessionId?: string;
  profileId: string;
}

function requestBody(input: IntentAwareRequest) {
  if (!BARCODE.test(input.barcode) || !validPersonalizationId(input.profileId) ||
      (input.savedIntentId !== undefined && !validPersonalizationId(input.savedIntentId)) ||
      (input.intention !== undefined && input.savedIntentId !== undefined)) {
    throw new Error('Invalid recommendation request.');
  }
  const limit = input.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Invalid recommendation limit.');
  const intention = input.intention?.normalize('NFC').trim();
  if (intention !== undefined && (CONTROL.test(intention) || [...intention].length > 240 ||
      new TextEncoder().encode(intention).byteLength > 512)) {
    throw new Error('Invalid shopping intention.');
  }
  return {
    version: '2.0.0', barcode: input.barcode, profileId: input.profileId, limit,
    ...(intention ? { intention } : {}),
    ...(input.savedIntentId ? { savedIntentId: input.savedIntentId } : {}),
  };
}

function mapResponse(value: unknown, input: IntentAwareRequest): IntentAwareResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recommendation response.');
  const data = value as ProductSubstitutionV2Response;
  if (data.version !== '2.0.0' || !['success', 'no_eligible_candidates', 'insufficient_data'].includes(data.status) ||
      !data.targetProduct || data.targetProduct.barcode !== input.barcode ||
      !Array.isArray(data.substitutions) || data.substitutions.length > 20 ||
      !['semantic', 'deterministic'].includes(data.rankingMode) ||
      !['DETERMINISTIC_BASELINE', 'SEMANTIC_CONFIDENT', 'SEMANTIC_FALLBACK'].includes(data.rankingReasonCode) ||
      (data.recommendationSessionId !== undefined && !validPersonalizationId(data.recommendationSessionId))) {
    throw new Error('Invalid recommendation response.');
  }
  const substitutions = data.substitutions.map(item => {
    if (!item || !BARCODE.test(item.barcode) || typeof item.productName !== 'string' ||
        !['green', 'grey'].includes(item.safetyRating) || !Array.isArray(item.reasonCodes)) {
      throw new Error('Invalid recommendation response.');
    }
    return {
      barcode: item.barcode,
      productName: item.productName,
      brand: item.brand,
      nutriscoreGrade: item.nutriscoreGrade,
      safetyRating: item.safetyRating,
      reasonCodes: item.reasonCodes,
      contextualFit: item.rankingMode === 'semantic' ? 'applied' as const : 'not_applied' as const,
    };
  });
  return {
    status: data.status, targetProduct: data.targetProduct, substitutions,
    rankingMode: data.rankingMode, rankingReasonCode: data.rankingReasonCode,
    emptyStateReason: data.emptyStateReason,
    ...(data.recommendationSessionId ? { recommendationSessionId: data.recommendationSessionId } : {}),
    profileId: input.profileId,
  };
}

/** Backend contract boundary. No local ranking or caller-supplied safety profile is accepted. */
export async function getIntentAwareRecommendations(input: IntentAwareRequest): Promise<IntentAwareResult> {
  const body = requestBody(input);
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in to get recommendations.');
  const base = process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('Recommendations are unavailable.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await currentUser.getIdToken();
    if (auth.currentUser?.uid !== currentUser.uid) throw new Error('Sign in to get recommendations.');
    const response = await fetch(`${base}/api/recommendations/substitutions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) throw new Error('Recommendations are unavailable.');
    return mapResponse(await response.json(), input);
  } catch {
    throw new Error('Recommendations are unavailable.');
  } finally {
    clearTimeout(timer);
  }
}

/** A missing server session means feedback is unavailable for this response. */
export async function recordRecommendationFeedback(
  result: IntentAwareResult,
  candidateBarcode: string,
  action: RecommendationAction,
  rejectionReason?: RejectionReason
): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to record feedback.');
  if (!result.recommendationSessionId) return null;
  if (!result.substitutions.some(item => item.barcode === candidateBarcode)) {
    throw new Error('Candidate is not in this recommendation session.');
  }
  const eventId = uuidv4();
  const db = await initialiseSQLiteDatabase();
  await queueRecommendationEvent(db, user.uid, {
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    eventId, profileId: result.profileId,
    recommendationSessionId: result.recommendationSessionId,
    originalBarcode: result.targetProduct.barcode,
    candidateBarcode, action,
    ...(rejectionReason ? { rejectionReason } : {}),
    occurredAt: new Date().toISOString(),
  });
  // The queued ID survives network failure and is deduplicated by the server.
  void drainRecommendationEvents(user.uid).catch(() => undefined);
  return eventId;
}
