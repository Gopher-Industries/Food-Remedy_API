import type { RankedSubstitution } from '@/services/substitutionEligibility';
import type { CandidateSemanticEvaluation, SemanticDimension, SemanticDimensionResult } from './semanticFitEvaluator';

export const COMPOSITE_RANKING_POLICY_VERSION = 'food-composite-v1' as const;

/** Provisional conservative policy; production enablement requires BE069 approval. */
export const COMPOSITE_POLICY = {
  version: COMPOSITE_RANKING_POLICY_VERSION,
  deterministicWeight: 0.55,
  semanticWeight: 0.45,
  mediumConfidence: 0.65,
  highConfidence: 0.85,
  mediumSignalFactor: 0.5,
  dimensions: {
    functional_fit: 0.4,
    occasion_fit: 0.25,
    convenience_fit: 0.2,
    preference_fit: 0.1,
    familiarity_fit: 0.05,
  } satisfies Record<SemanticDimension, number>,
} as const;

export type CompositeFallbackReason = 'incomplete' | 'version_mismatch' | 'low_confidence';

export interface CompositeRankedCandidate {
  candidate: RankedSubstitution;
  semanticScore: number;
  semanticConfidence: number;
  compositeScore: number;
}

export type CompositeRankingResult =
  | { applied: true; candidates: CompositeRankedCandidate[]; model: string;
      questionSetVersion: string; policyVersion: typeof COMPOSITE_RANKING_POLICY_VERSION;
      dimensionsUsed: SemanticDimension[] }
  | { applied: false; reason: CompositeFallbackReason };

function isApplied(value: SemanticDimensionResult | undefined): value is Extract<SemanticDimensionResult, { status: 'applied' }> {
  return value?.status === 'applied' && Number.isFinite(value.normalizedScore) &&
    value.normalizedScore >= 0 && value.normalizedScore <= 1 &&
    Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1;
}

/** All candidates must have a valid answer; each dimension is used for all or none. */
export function composeSubstitutionRanking(
  candidates: RankedSubstitution[], evaluations: CandidateSemanticEvaluation[],
  limit: number
): CompositeRankingResult {
  if (!candidates.length || candidates.length !== evaluations.length) return { applied: false, reason: 'incomplete' };
  const results = new Map(evaluations.map(item => [item.barcode, item]));
  if (results.size !== candidates.length || candidates.some(candidate => !results.has(candidate.barcode)) ||
      evaluations.some(item => !item.available)) return { applied: false, reason: 'incomplete' };
  const successful = evaluations.filter((item): item is Extract<CandidateSemanticEvaluation, { available: true }> => item.available);
  const model = successful[0].model;
  const questionSetVersion = successful[0].questionSetVersion;
  if (successful.some(item => item.model !== model || item.questionSetVersion !== questionSetVersion)) {
    return { applied: false, reason: 'version_mismatch' };
  }
  const dimensions = Object.keys(COMPOSITE_POLICY.dimensions) as SemanticDimension[];
  const dimensionsUsed = dimensions.filter(dimension => successful.every(item =>
    isApplied(item.dimensions[dimension]) && item.dimensions[dimension].confidence >= COMPOSITE_POLICY.mediumConfidence));
  if (!dimensionsUsed.length) return { applied: false, reason: 'low_confidence' };
  const totalWeight = dimensionsUsed.reduce((total, dimension) => total + COMPOSITE_POLICY.dimensions[dimension], 0);
  const composite = candidates.map(candidate => {
    const evaluation = results.get(candidate.barcode) as Extract<CandidateSemanticEvaluation, { available: true }>;
    let score = 0;
    let confidence = 0;
    for (const dimension of dimensionsUsed) {
      const answer = evaluation.dimensions[dimension] as Extract<SemanticDimensionResult, { status: 'applied' }>;
      const factor = answer.confidence >= COMPOSITE_POLICY.highConfidence ? 1 : COMPOSITE_POLICY.mediumSignalFactor;
      const adjusted = 0.5 + factor * (answer.normalizedScore - 0.5);
      score += COMPOSITE_POLICY.dimensions[dimension] * adjusted;
      confidence += COMPOSITE_POLICY.dimensions[dimension] * answer.confidence;
    }
    const semanticScore = Math.round((score / totalWeight) * 1_000_000) / 1_000_000;
    return {
      candidate,
      semanticScore,
      semanticConfidence: Math.round((confidence / totalWeight) * 1_000_000) / 1_000_000,
      compositeScore: COMPOSITE_POLICY.deterministicWeight * candidate.confidenceScore +
        COMPOSITE_POLICY.semanticWeight * semanticScore,
    };
  });
  composite.sort((left, right) =>
    (left.candidate.safetyRating === right.candidate.safetyRating ? 0 : left.candidate.safetyRating === 'green' ? -1 : 1) ||
    right.compositeScore - left.compositeScore || left.candidate.barcode.localeCompare(right.candidate.barcode)
  );
  return { applied: true, candidates: composite.slice(0, Math.max(1, Math.min(20, limit))),
    model, questionSetVersion, policyVersion: COMPOSITE_RANKING_POLICY_VERSION, dimensionsUsed };
}
