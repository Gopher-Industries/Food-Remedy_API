import { COMPOSITE_POLICY, COMPOSITE_RANKING_POLICY_VERSION,
  composeSubstitutionRanking } from '@/server/compositeSubstitutionRanking';
import type { CandidateSemanticEvaluation, SemanticDimensionResult } from '@/server/semanticFitEvaluator';
import type { RankedSubstitution } from '@/services/substitutionEligibility';
import { semanticProduct } from './fixtures/semanticFitScenarios';

function ranked(barcode: string, deterministicScore: number, safetyRating: 'green' | 'grey' = 'green'): RankedSubstitution {
  return { barcode, product: semanticProduct(barcode, `Food ${barcode}`, 'snacks'),
    score: deterministicScore * 100, confidenceScore: deterministicScore, safetyRating,
    reasonCodes: ['SAFE_ALLERGEN_FREE'], reasons: [] };
}

function answer(score: number, confidence = 0.9): SemanticDimensionResult {
  return { status: 'applied', normalizedScore: score, rawScore: score * 3, confidence,
    probabilities: { '0': 0, '1': 0, '2': 0, '3': 1 } };
}

function evaluation(barcode: string, score: number, confidence = 0.9): CandidateSemanticEvaluation {
  return { available: true, barcode, stateVersion: 'food-semantic-state-v1',
    questionSetVersion: 'food-fit-score-v1', model: 'jev-1.13.0',
    dimensions: { functional_fit: answer(score, confidence), occasion_fit: answer(score, confidence),
      convenience_fit: answer(score, confidence), preference_fit: { status: 'not_applied' },
      familiarity_fit: { status: 'not_applied' } },
    acceptanceLikelihood: 'not_applied', usage: { inputTokens: 100, outputTokens: 5 }, durationMs: 10 };
}

describe('confidence-gated composite policy', () => {
  it('can reorder green candidates while keeping grey behind every green candidate', () => {
    const candidates = [ranked('a', 0.65), ranked('b', 0.45), ranked('c', 0.95, 'grey')];
    const result = composeSubstitutionRanking(candidates,
      [evaluation('a', 0), evaluation('b', 1), evaluation('c', 1)], 3);
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('Expected composition');
    expect(result.candidates.map(item => item.candidate.barcode)).toEqual(['b', 'a', 'c']);
    expect(result.policyVersion).toBe(COMPOSITE_RANKING_POLICY_VERSION);
    expect(result.candidates[0].candidate.safetyRating).toBe('green');
  });

  it('falls back for partial candidate coverage or a version mismatch', () => {
    const candidates = [ranked('a', 0.6), ranked('b', 0.5)];
    expect(composeSubstitutionRanking(candidates, [evaluation('a', 1)], 2))
      .toEqual({ applied: false, reason: 'incomplete' });
    const wrong = evaluation('b', 1);
    if (wrong.available) wrong.model = 'jev-1.12.0';
    expect(composeSubstitutionRanking(candidates, [evaluation('a', 1), wrong], 2))
      .toEqual({ applied: false, reason: 'version_mismatch' });
    expect(composeSubstitutionRanking(candidates, [evaluation('a', 1), { available: false, barcode: 'b', reason: 'timeout' }], 2))
      .toEqual({ applied: false, reason: 'incomplete' });
  });

  it('drops low-confidence dimensions for all candidates and falls back if none remain', () => {
    const candidates = [ranked('a', 0.6), ranked('b', 0.5)];
    const lowA = evaluation('a', 1, COMPOSITE_POLICY.mediumConfidence - 0.001);
    const lowB = evaluation('b', 0, COMPOSITE_POLICY.mediumConfidence - 0.001);
    expect(composeSubstitutionRanking(candidates, [lowA, lowB], 2))
      .toEqual({ applied: false, reason: 'low_confidence' });
    const highA = evaluation('a', 0.5);
    const highB = evaluation('b', 0.5);
    if (highA.available && highB.available) {
      highA.dimensions.occasion_fit = answer(0, COMPOSITE_POLICY.mediumConfidence - 0.001);
      highB.dimensions.occasion_fit = answer(1, 0.99);
    }
    const result = composeSubstitutionRanking(candidates, [highA, highB], 2);
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.dimensionsUsed).not.toContain('occasion_fit');
      expect(result.candidates.map(item => item.candidate.barcode)).toEqual(['a', 'b']);
    }
  });

  it('down-weights medium confidence and uses stable barcode ties', () => {
    const candidates = [ranked('b', 0.5), ranked('a', 0.5)];
    const medium = COMPOSITE_POLICY.mediumConfidence;
    const result = composeSubstitutionRanking(candidates,
      [evaluation('b', 1, medium), evaluation('a', 1, medium)], 2);
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.candidates.map(item => item.candidate.barcode)).toEqual(['a', 'b']);
      expect(result.candidates[0].semanticScore).toBeCloseTo(0.75);
      expect(result.candidates[0].semanticConfidence).toBeCloseTo(medium);
    }
  });
});
