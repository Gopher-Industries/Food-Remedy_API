import { buildSemanticFitState, evaluateSemanticShortlist, semanticFitQuestions,
  SEMANTIC_QUESTION_SET_VERSION, SEMANTIC_STATE_VERSION } from '@/server/semanticFitEvaluator';
import { MockSemanticFitClient, type SemanticFitRequest, type SemanticFitResult } from '@/server/semanticFitClient';
import type { SemanticFitClient } from '@/server/semanticFitClient';
import { semanticContext, semanticFitScenarios, semanticProfile, semanticProduct } from './fixtures/semanticFitScenarios';

function successful(request: SemanticFitRequest): SemanticFitResult {
  return { available: true, model: 'jev-1.13.0', usage: { inputTokens: 100, outputTokens: 5 }, durationMs: 12,
    answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {
      score: 2.3, confidence: 0.85, probabilities: { '0': 0.1, '1': 0.1, '2': 0.2, '3': 0.6 },
    }])) };
}

describe('versioned Jev semantic-fit evaluation', () => {
  it.each(semanticFitScenarios)('builds a redacted state for $name', scenario => {
    const state = buildSemanticFitState(scenario.original, scenario.candidate, scenario.context);
    expect(state.schemaVersion).toBe(SEMANTIC_STATE_VERSION);
    expect(state.original.name).toBe(scenario.original.productName);
    expect(state.candidate.name).toBe(scenario.candidate.productName);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain(scenario.original.barcode);
    expect(serialized).not.toContain(scenario.candidate.barcode);
    expect(serialized).not.toMatch(/allerg|traces|nutriment|dietaryForm|synthetic-owner|Milk/i);
  });

  it('keeps non-medical preparation context for a commuting breakfast', () => {
    const scenario = semanticFitScenarios[2];
    const state = buildSemanticFitState(scenario.original, scenario.candidate, scenario.context);
    expect(state.intention.text).toContain('without a bowl');
    expect(state.intention.occasion).toBe('commute');
  });

  it('batches the same independent questions per safe candidate and retains probabilities internally', async () => {
    const scenario = semanticFitScenarios[0];
    const second = semanticProduct('036000291483', 'Oat cakes', 'oat-cakes');
    const conflict = semanticProduct('036000291490', 'Milk biscuits', 'biscuits', { allergens: ['milk'] });
    const client = new MockSemanticFitClient(successful);
    const results = await evaluateSemanticShortlist(client, scenario.original,
      [scenario.candidate, conflict, second], semanticProfile, scenario.context);
    expect(results).toHaveLength(2);
    expect(client.calls).toHaveLength(2);
    expect(Object.keys(client.calls[0].questions)).toEqual(Object.keys(client.calls[1].questions));
    expect(Object.keys(client.calls[0].questions)).toEqual(['functional_fit', 'occasion_fit', 'convenience_fit']);
    expect(results[0]).toEqual(expect.objectContaining({ available: true, barcode: scenario.candidate.barcode,
      stateVersion: SEMANTIC_STATE_VERSION, questionSetVersion: SEMANTIC_QUESTION_SET_VERSION,
      model: 'jev-1.13.0', acceptanceLikelihood: 'not_applied' }));
    if (!results[0].available) throw new Error('Unexpected unavailable result');
    expect(results[0].dimensions.functional_fit).toEqual({ status: 'applied', rawScore: 2.3,
      normalizedScore: 2.3 / 3, confidence: 0.85,
      probabilities: { '0': 0.1, '1': 0.1, '2': 0.2, '3': 0.6 } });
    expect(results[0].dimensions.preference_fit).toEqual({ status: 'not_applied' });
    expect(results[0].dimensions.familiarity_fit).toEqual({ status: 'not_applied' });
    expect(client.calls.map(call => JSON.stringify(call.state)).join(' ')).not.toContain('Milk biscuits');
  });

  it('adds preference and familiarity questions only when their evidence exists', () => {
    const context = semanticContext('A familiar snack');
    context.explicit = [
      { dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'explicit',
        confidence: 1, sourceVersion: 'fixture-v1', updatedAt: '2026-09-26T00:00:00Z' },
      { dimension: 'familiarity', value: 'familiar', sentiment: 'like', provenance: 'explicit',
        confidence: 1, sourceVersion: 'fixture-v1', updatedAt: '2026-09-26T00:00:00Z' },
    ];
    expect(Object.keys(semanticFitQuestions(context))).toEqual([
      'functional_fit', 'occasion_fit', 'convenience_fit', 'preference_fit', 'familiarity_fit',
    ]);
    const state = buildSemanticFitState(semanticFitScenarios[0].original, semanticFitScenarios[0].candidate, context);
    expect(state.preferences.explicit).toEqual([
      { dimension: 'texture', value: 'crunchy', sentiment: 'like' },
      { dimension: 'familiarity', value: 'familiar', sentiment: 'like' },
    ]);
  });

  it('drops intention text that appears to contain an unverified safety restriction', () => {
    const scenario = semanticFitScenarios[0];
    const context = semanticContext('No peanuts because of an allergy; also a lunchbox snack');
    const state = buildSemanticFitState(scenario.original, scenario.candidate, context);
    expect(state.intention.text).toBeNull();
    expect(JSON.stringify(state)).not.toContain('peanuts');
  });

  it('evaluates a bounded shortlist with at most two concurrent calls', async () => {
    const scenario = semanticFitScenarios[0];
    let active = 0;
    let peak = 0;
    const client: SemanticFitClient = { evaluate: async request => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return successful(request);
    } };
    const candidates = Array.from({ length: 5 }, (_, index) =>
      semanticProduct(`candidate-${index}`, `Candidate ${index}`, 'crackers'));
    const results = await evaluateSemanticShortlist(client, scenario.original, candidates,
      semanticProfile, scenario.context);
    expect(results).toHaveLength(5);
    expect(peak).toBe(2);
  });
});
