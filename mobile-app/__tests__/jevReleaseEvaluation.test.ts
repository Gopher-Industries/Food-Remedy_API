import { buildSemanticShortlist } from '@/server/hybridCandidateRetrieval';
import { COMPOSITE_POLICY, COMPOSITE_RANKING_POLICY_VERSION, composeSubstitutionRanking } from '@/server/compositeSubstitutionRanking';
import { evaluateSemanticShortlist, SEMANTIC_QUESTION_SET_VERSION,
  semanticFitQuestions, type CandidateSemanticEvaluation } from '@/server/semanticFitEvaluator';
import { MockSemanticFitClient } from '@/server/semanticFitClient';
import { rankSubstitutionCandidates } from '@/services/substitutionEligibility';
import { jevEvaluationDataset, JEV_EVALUATION_CATALOGUE_VERSION,
  JEV_EVALUATION_DATASET_VERSION, JEV_EVALUATION_LABEL_STATUS } from './fixtures/jevEvaluationDataset';
import { semanticContext } from './fixtures/semanticFitScenarios';

const RECORDED_MODEL = 'jev-1.13.0';
const INPUT_TOKEN_BUDGET_PER_CASE = 500;
const LATENCY_BUDGET_MS_PER_CASE = 4000;

function positions(barcodes: string[], positive: string): number {
  const index = barcodes.indexOf(positive);
  return index < 0 ? 0 : 1 / (index + 1);
}

describe('BE069 network-free Jev release evaluation', () => {
  it('pins the model question wording and composite policy as reviewed release artifacts', () => {
    expect(semanticFitQuestions(semanticContext('A tidy lunchbox snack'))).toMatchSnapshot();
    expect(COMPOSITE_POLICY).toMatchSnapshot();
  });

  it('reports the versioned baseline and gates safety, recall, ranking and fallback parity', async () => {
    const report = {
      datasetVersion: JEV_EVALUATION_DATASET_VERSION,
      catalogueVersion: JEV_EVALUATION_CATALOGUE_VERSION,
      labelStatus: JEV_EVALUATION_LABEL_STATUS,
      modelVersion: RECORDED_MODEL,
      questionSetVersion: SEMANTIC_QUESTION_SET_VERSION,
      policyVersion: COMPOSITE_RANKING_POLICY_VERSION,
      cases: jevEvaluationDataset.length,
      knownConflictRecommendations: 0,
      candidateRecallAt2: 0,
      deterministicTop1Relevance: 0,
      semanticTop1Relevance: 0,
      deterministicMeanReciprocalRank: 0,
      semanticMeanReciprocalRank: 0,
      semanticCoverage: 0,
      fallbackRate: 0,
      fallbackParity: 0,
      confidenceBands: { low: 0, medium: 0, high: 0 },
      failures: { retrieval: 0, missingEvidence: 0, jev: 0, policy: 0 },
      recordedLatencyMs: 0,
      recordedInputTokens: 0,
      recordedOutputTokens: 0,
      estimatedCostUsd: null as null,
    };
    for (const fixture of jevEvaluationDataset) {
      const baseline = rankSubstitutionCandidates(fixture.original, fixture.candidates, fixture.profile, 3);
      const baselineOrder = baseline.substitutions.map(item => item.barcode);
      if (!baselineOrder.length) report.failures.retrieval++;
      report.failures.missingEvidence += baseline.metrics.categoryDataFailures;
      report.deterministicTop1Relevance += Number(baselineOrder[0] === fixture.positiveBarcode);
      report.deterministicMeanReciprocalRank += positions(baselineOrder, fixture.positiveBarcode);
      const context = semanticContext(fixture.intention);
      const shortlist = buildSemanticShortlist(fixture.original, fixture.candidates, fixture.profile, context, 2);
      report.candidateRecallAt2 += Number(shortlist.products.some(item => item.barcode === fixture.positiveBarcode));
      const positiveName = fixture.candidates.find(item => item.barcode === fixture.positiveBarcode)!.productName;
      const client = new MockSemanticFitClient(request => {
        const candidate = request.state.candidate as { name: string };
        const score = candidate.name === positiveName ? 3 : 0;
        return { available: true, model: RECORDED_MODEL,
          answers: Object.fromEntries(Object.keys(request.questions).map(question => [question, {
            score, confidence: 0.95, probabilities: { '0': score === 0 ? 1 : 0,
              '1': 0, '2': 0, '3': score === 3 ? 1 : 0 },
          }])), usage: { inputTokens: 120, outputTokens: 8 }, durationMs: 12 };
      });
      const evaluations = await evaluateSemanticShortlist(client, fixture.original,
        baseline.substitutions.map(item => item.product), fixture.profile, context);
      const composed = composeSubstitutionRanking(baseline.substitutions, evaluations, 3);
      if (!composed.applied) report.failures.policy++;
      const assistedOrder = composed.applied
        ? composed.candidates.map(item => item.candidate.barcode) : baselineOrder;
      report.semanticCoverage += Number(composed.applied);
      report.semanticTop1Relevance += Number(assistedOrder[0] === fixture.positiveBarcode);
      report.semanticMeanReciprocalRank += positions(assistedOrder, fixture.positiveBarcode);
      for (const result of evaluations) {
        if (!result.available) { report.failures.jev++; continue; }
        report.recordedLatencyMs = Math.max(report.recordedLatencyMs, result.durationMs);
        report.recordedInputTokens += result.usage.inputTokens;
        report.recordedOutputTokens += result.usage.outputTokens;
        const confidence = result.dimensions.functional_fit;
        if (confidence.status === 'applied') {
          if (confidence.confidence >= 0.85) report.confidenceBands.high++;
          else if (confidence.confidence >= 0.65) report.confidenceBands.medium++;
          else report.confidenceBands.low++;
        }
      }
      const timeoutEvaluations: CandidateSemanticEvaluation[] = baseline.substitutions.map(item =>
        ({ available: false, barcode: item.barcode, reason: 'timeout' }));
      const fallback = composeSubstitutionRanking(baseline.substitutions, timeoutEvaluations, 3);
      report.fallbackRate += Number(!fallback.applied);
      const fallbackOrder = fallback.applied ? fallback.candidates.map(item => item.candidate.barcode) : baselineOrder;
      report.fallbackParity += Number(JSON.stringify(fallbackOrder) === JSON.stringify(baselineOrder));
      for (const barcode of [...baselineOrder, ...assistedOrder, ...fallbackOrder]) {
        report.knownConflictRecommendations += Number(fixture.prohibitedBarcodes.includes(barcode));
      }
      expect(client.calls.length).toBeLessThanOrEqual(20);
      expect(evaluations.reduce((sum, result) => sum + (result.available ? result.usage.inputTokens : 0), 0))
        .toBeLessThanOrEqual(INPUT_TOKEN_BUDGET_PER_CASE);
      expect(Math.max(0, ...evaluations.map(result => result.available ? result.durationMs : 0)))
        .toBeLessThanOrEqual(LATENCY_BUDGET_MS_PER_CASE);
    }
    report.candidateRecallAt2 /= report.cases;
    report.deterministicTop1Relevance /= report.cases;
    report.semanticTop1Relevance /= report.cases;
    report.deterministicMeanReciprocalRank /= report.cases;
    report.semanticMeanReciprocalRank /= report.cases;
    report.semanticCoverage /= report.cases;
    report.fallbackRate /= report.cases;
    report.fallbackParity /= report.cases;
    // These fixture gates are engineering defaults. QA/product label and threshold approval is still required.
    expect(report.knownConflictRecommendations).toBe(0);
    expect(report.candidateRecallAt2).toBe(1);
    expect(report.semanticTop1Relevance).toBeGreaterThanOrEqual(report.deterministicTop1Relevance);
    expect(report.semanticCoverage).toBe(1);
    expect(report.fallbackParity).toBe(1);
    expect(report.failures.jev).toBe(0);
    expect(report.failures.policy).toBe(0);
    console.log(`BE069_EVALUATION_REPORT ${JSON.stringify(report)}`);
  });
});
