import type { Product } from '@/types/Product';
import { validPersonalizationId } from '@/services/personalizationValidation';
import { MAX_SUBSTITUTION_CANDIDATES, rankSubstitutionCandidates, type RankedSubstitution,
  type SubstitutionRankingMetrics, type SubstitutionEmptyStateReason } from '@/services/substitutionEligibility';
import { normalizeBarcodeCandidate } from './productBarcode';
import { compactSubstitution, compactTarget, DEFAULT_SUBSTITUTION_LIMIT, MAX_API_SUBSTITUTION_LIMIT,
  ProductNotFoundError, ProfileUnavailableError, SubstitutionValidationError,
  type ProductSubstitutionRepository } from './productSubstitutionService';
import { resolvePersonalizationContext, type PersonalizationContext,
  type PersonalizationContextRepository } from './personalizationContext';

export const SUBSTITUTION_CONTRACT_VERSION_V2 = '2.0.0' as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export interface ValidatedSubstitutionRequestV2 {
  barcode: string;
  profileId: string;
  limit: number;
  intention?: string;
  savedIntentId?: string;
}

function wellFormed(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}

export function validateSubstitutionRequestV2(value: unknown): ValidatedSubstitutionRequestV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SubstitutionValidationError('INVALID_REQUEST', 'Request body must be a JSON object.');
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['version', 'barcode', 'profileId', 'limit', 'intention', 'savedIntentId'].includes(key))) {
    throw new SubstitutionValidationError('UNSUPPORTED_FIELD', 'Request contains an unsupported field.');
  }
  if (data.version !== SUBSTITUTION_CONTRACT_VERSION_V2 || !validPersonalizationId(data.profileId)) {
    throw new SubstitutionValidationError('INVALID_REQUEST', 'Invalid v2 request.');
  }
  const barcode = normalizeBarcodeCandidate(data.barcode);
  if (!barcode.ok) throw new SubstitutionValidationError('INVALID_BARCODE', 'Invalid barcode.');
  const limit = data.limit ?? DEFAULT_SUBSTITUTION_LIMIT;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_API_SUBSTITUTION_LIMIT) {
    throw new SubstitutionValidationError('INVALID_LIMIT', 'Invalid limit.');
  }
  if (data.intention !== undefined && data.savedIntentId !== undefined) {
    throw new SubstitutionValidationError('INVALID_REQUEST', 'Choose one intention source.');
  }
  if (data.savedIntentId !== undefined && !validPersonalizationId(data.savedIntentId)) {
    throw new SubstitutionValidationError('INVALID_REQUEST', 'Invalid saved intention.');
  }
  if (data.intention !== undefined && (typeof data.intention !== 'string' ||
      CONTROL.test(data.intention) || !wellFormed(data.intention) ||
      [...data.intention].length > 240 || new TextEncoder().encode(data.intention).byteLength > 512)) {
    throw new SubstitutionValidationError('INVALID_REQUEST', 'Invalid intention.');
  }
  const intention = typeof data.intention === 'string' ? data.intention.normalize('NFC').trim() : '';
  return {
    barcode: barcode.barcode, profileId: data.profileId, limit: limit as number,
    ...(intention ? { intention } : {}),
    ...(data.savedIntentId ? { savedIntentId: data.savedIntentId as string } : {}),
  };
}

function v2Item(candidate: RankedSubstitution) {
  const { confidenceScore, reasons: _reasons, ...compact } = compactSubstitution(candidate);
  return {
    ...compact,
    deterministicScore: confidenceScore,
    semanticScore: null,
    semanticConfidence: null,
    rankingMode: 'deterministic' as const,
  };
}

export interface ProductSubstitutionV2Response {
  version: typeof SUBSTITUTION_CONTRACT_VERSION_V2;
  status: 'success' | 'no_eligible_candidates' | 'insufficient_data';
  targetProduct: ReturnType<typeof compactTarget>;
  substitutions: ReturnType<typeof v2Item>[];
  rankingMode: 'deterministic';
  emptyStateReason: SubstitutionEmptyStateReason | null;
  recommendationSessionId?: string;
}

export interface ProductSubstitutionV2Execution {
  response: ProductSubstitutionV2Response;
  metrics: SubstitutionRankingMetrics;
  profileId: string;
  original: Product;
  eligible: RankedSubstitution[];
  context: PersonalizationContext;
}

/** V2 changes the authenticated selection and response contract, not ranking. */
export async function executeProductSubstitutionV2(
  repository: ProductSubstitutionRepository,
  contextRepository: PersonalizationContextRepository,
  uid: string,
  request: ValidatedSubstitutionRequestV2
): Promise<ProductSubstitutionV2Execution> {
  const original = await repository.getProduct(request.barcode);
  if (!original) throw new ProductNotFoundError('Target product was not found.');
  const profile = await repository.getOwnedProfile?.(uid, request.profileId);
  if (!profile || profile.status === false) throw new ProfileUnavailableError('Profile unavailable.');
  const context = await resolvePersonalizationContext(contextRepository, uid, request.profileId, request.savedIntentId);
  if (request.intention) context.intention = { text: request.intention, provenance: 'explicit', source: 'one_off' };
  const candidates = await repository.getCandidates(original, MAX_SUBSTITUTION_CANDIDATES);
  const ranked = rankSubstitutionCandidates(original, candidates, profile, request.limit);
  return {
    response: {
      version: SUBSTITUTION_CONTRACT_VERSION_V2,
      status: ranked.substitutions.length ? 'success' : ranked.emptyStateReason === 'INSUFFICIENT_PRODUCT_DATA' ? 'insufficient_data' : 'no_eligible_candidates',
      targetProduct: compactTarget(original),
      substitutions: ranked.substitutions.map(v2Item),
      rankingMode: 'deterministic',
      emptyStateReason: ranked.emptyStateReason,
    },
    metrics: ranked.metrics,
    profileId: profile.profileId,
    original,
    eligible: ranked.substitutions,
    context,
  };
}
