import { buildSemanticShortlist } from '@/server/hybridCandidateRetrieval';
import { composeSubstitutionRanking, COMPOSITE_RANKING_POLICY_VERSION } from '@/server/compositeSubstitutionRanking';
import { evaluateSemanticShortlist, SEMANTIC_QUESTION_SET_VERSION } from '@/server/semanticFitEvaluator';
import { createSemanticFitClientFromEnvironment } from '@/server/typesafeSemanticFitClient';
import { semanticComparisonCandidates } from '@/server/productSubstitutionV2';
import { rankSubstitutionCandidates } from '@/services/substitutionEligibility';
import { jevEvaluationDataset, JEV_EVALUATION_CATALOGUE_VERSION,
  JEV_EVALUATION_DATASET_VERSION } from './fixtures/jevEvaluationDataset';
import { semanticContext } from './fixtures/semanticFitScenarios';

const requested = process.env.RUN_TYPESAFE_LIVE === '1';

(requested ? describe : describe.skip)('opt-in BE069 live synthetic evaluation', () => {
  it('reports aggregate quality, latency and usage without logging prompts or profile data', async () => {
    if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is required for the opt-in live evaluation.');
    const client = createSemanticFitClientFromEnvironment();
    const report = {
      datasetVersion: JEV_EVALUATION_DATASET_VERSION,
      catalogueVersion: JEV_EVALUATION_CATALOGUE_VERSION,
      questionSetVersion: SEMANTIC_QUESTION_SET_VERSION,
      policyVersion: COMPOSITE_RANKING_POLICY_VERSION,
      modelVersions: [] as string[],
      cases: jevEvaluationDataset.length,
      knownConflictRecommendations: 0,
      candidateRecallAt2: 0,
      deterministicTop1Relevance: 0,
      semanticTop1Relevance: 0,
      semanticCoverage: 0,
      fallbackCount: 0,
      upstreamUnavailable: 0,
      durationMs: [] as number[],
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: null as null,
    };
    for (const fixture of jevEvaluationDataset) {
      const context = semanticContext(fixture.intention);
      const baseline = rankSubstitutionCandidates(fixture.original, fixture.candidates, fixture.profile, 3);
      const shortlist = buildSemanticShortlist(fixture.original, fixture.candidates, fixture.profile, context, 2);
      report.candidateRecallAt2 += Number(shortlist.products.some(item => item.barcode === fixture.positiveBarcode));
      const comparison = semanticComparisonCandidates(fixture.original, baseline.substitutions,
        shortlist.products, fixture.profile);
      report.deterministicTop1Relevance += Number(baseline.substitutions[0]?.barcode === fixture.positiveBarcode);
      const evaluations = await evaluateSemanticShortlist(client, fixture.original,
        comparison.map(item => item.product), fixture.profile, context);
      const composition = composeSubstitutionRanking(comparison, evaluations, 3);
      const output = composition.applied ? composition.candidates.map(item => item.candidate.barcode)
        : baseline.substitutions.map(item => item.barcode);
      report.semanticCoverage += Number(composition.applied);
      report.fallbackCount += Number(!composition.applied);
      report.semanticTop1Relevance += Number(output[0] === fixture.positiveBarcode);
      for (const barcode of output) report.knownConflictRecommendations += Number(fixture.prohibitedBarcodes.includes(barcode));
      for (const result of evaluations) {
        if (!result.available) { report.upstreamUnavailable++; continue; }
        report.modelVersions.push(result.model);
        report.durationMs.push(result.durationMs);
        report.inputTokens += result.usage.inputTokens;
        report.outputTokens += result.usage.outputTokens;
      }
    }
    report.modelVersions = [...new Set(report.modelVersions)].sort();
    report.durationMs.sort((a, b) => a - b);
    expect(report.knownConflictRecommendations).toBe(0);
    console.log(`BE069_LIVE_REPORT ${JSON.stringify(report)}`);
  }, 180_000);
});
