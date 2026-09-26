import { createSemanticFitClientFromEnvironment } from '@/server/typesafeSemanticFitClient';
import { evaluateSemanticShortlist } from '@/server/semanticFitEvaluator';
import { semanticFitScenarios, semanticProfile } from './fixtures/semanticFitScenarios';

const runLive = process.env.RUN_TYPESAFE_LIVE === '1' && Boolean(process.env.TYPESAFE_API_KEY);

(runLive ? describe : describe.skip)('opt-in live TypeSafe semantic evaluation', () => {
  it('evaluates one synthetic, safety-eligible candidate without printing state', async () => {
    const scenario = semanticFitScenarios[0];
    const client = createSemanticFitClientFromEnvironment();
    const result = await evaluateSemanticShortlist(client, scenario.original,
      [scenario.candidate], semanticProfile, scenario.context);
    expect(result).toHaveLength(1);
    expect(result[0].available).toBe(true);
    if (result[0].available) {
      console.log(JSON.stringify({ model: result[0].model, questionSetVersion: result[0].questionSetVersion,
        dimensions: Object.keys(result[0].dimensions), durationMs: result[0].durationMs,
        inputTokens: result[0].usage.inputTokens }));
    }
  }, 15_000);
});
