import type { Product } from '@/types/Product';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import { MockSemanticFitClient } from '@/server/semanticFitClient';
import { createProductSubstitutionHandler } from '@/server/productSubstitutionHandler';
import { FirestoreJevRollout, type JevConfigStore } from '@/server/jevRollout';
import { ConsoleSubstitutionMetrics, type SubstitutionMetricEvent } from '@/server/substitutionObservability';

const BARCODE = '036000291452';
const CONFIG = { schemaVersion: 1, mode: 'shadow', canaryPercent: 0, modelVersion: 'jev-1.13.0',
  evaluationReference: 'qa-approval-123', maxCandidates: 5, maxEstimatedCostUsd: 0.1,
  inputUsdPerMillion: 1, outputUsdPerMillion: 1 };
const ENV = { JEV_RANKING_ENABLED: 'true', JEV_POLICY_APPROVAL_REFERENCE: 'qa-approval-123',
  TYPESAFE_MODEL: 'jev-1.13.0', JEV_CANARY_SALT: 'test-salt' };

function product(barcode: string, productName: string, sugars: number): Product {
  return { barcode, productName, genericName: null, brand: null, ingredientsText: null,
    ingredientsAnalysis: [], additives: [], allergens: ['soy'], categories: ['snacks'], category: 'snacks',
    labels: [], ingredients: [], traces: 'sesame', tracesFromIngredients: null,
    nutriments: { sugars_100g: sugars }, nutrientLevels: { fat: 'low', salt: 'low', sugars: 'low', 'saturated-fat': 'low' },
    nutriscoreGrade: 'C', productQuantity: null, productQuantityUnit: null, servingQuantity: null,
    servingQuantityUnit: null, completeness: 1, images: { root: '', primary: null, variants: {} } } as Product;
}
const original = product(BARCODE, 'Original snack', 12);
const candidates = [product('036000291469', 'Deterministic choice', 2),
  product('036000291476', 'Contextual choice', 15)];
const profile = { userId: 'private-owner', profileId: 'child-1', firstName: '', lastName: '',
  status: true, relationship: 'Child', age: 8, avatarUrl: '', allergies: ['Milk'],
  intolerances: [], additives: [], dietaryForm: [] } as NutritionalProfile;

function request(): Request {
  return new Request('http://localhost/api/recommendations/substitutions', {
    method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: '2.0.0', barcode: BARCODE, profileId: 'child-1', intention: 'private lunchbox intention' }),
  });
}

function setup(store: JevConfigStore, events: SubstitutionMetricEvent[], client: MockSemanticFitClient) {
  return createProductSubstitutionHandler({
    tokenVerifier: { verifyIdToken: jest.fn().mockResolvedValue({ uid: 'private-owner' }) },
    repository: { getProduct: async () => original, getOwnedProfile: async () => profile,
      getAuthoritativeProfile: async () => profile, getCandidates: async () => candidates },
    contextRepository: { getOwnedProfile: async () => ({ active: true, child: true, evidenceConsent: false }),
      getExplicitPreferences: async () => null, getSavedIntent: async () => null,
      getRecentEvents: async () => [], getProductSemantics: async () => null },
    semanticClient: client, jevRollout: new FirestoreJevRollout(store, ENV),
    metrics: { record: event => events.push(event) },
  });
}

function client(): MockSemanticFitClient {
  return new MockSemanticFitClient(request => {
    const name = (request.state.candidate as { name: string }).name;
    const score = name === 'Contextual choice' ? 3 : 0;
    return { available: true, model: 'jev-1.13.0', durationMs: 9,
      usage: { inputTokens: 100, outputTokens: 10 },
      answers: Object.fromEntries(Object.keys(request.questions).map(key => [key,
        { score, confidence: 0.95, probabilities: { '0': score === 0 ? 1 : 0, '1': 0,
          '2': 0, '3': score === 3 ? 1 : 0 } }])),
    };
  });
}

test('shadow, canary, enabled and live kill switch keep deterministic substitutions available', async () => {
  let config: unknown = { ...CONFIG };
  const store: JevConfigStore = { get: jest.fn(async () => config) };
  const events: SubstitutionMetricEvent[] = [];
  const mock = client();
  const handler = setup(store, events, mock);
  const shadow = await (await handler(request())).json();
  expect(shadow.rankingMode).toBe('deterministic');
  expect(events.at(-1)?.jev).toEqual(expect.objectContaining({ mode: 'shadow', outcome: 'shadow', rankChangeCount: 2 }));
  expect(mock.calls).toHaveLength(2);

  config = { ...CONFIG, mode: 'canary', canaryPercent: 0 };
  const excluded = await (await handler(request())).json();
  expect(excluded.substitutions).toEqual(shadow.substitutions);
  expect(events.at(-1)?.jev?.outcome).toBe('canary_excluded');
  expect(mock.calls).toHaveLength(2);

  config = { ...CONFIG, mode: 'canary', canaryPercent: 100 };
  const canary = await (await handler(request())).json();
  expect(canary.rankingMode).toBe('semantic');
  expect(canary.substitutions[0].barcode).toBe('036000291476');
  expect(events.at(-1)?.jev?.outcome).toBe('applied');

  config = { ...CONFIG, mode: 'enabled' };
  expect((await (await handler(request())).json()).rankingMode).toBe('semantic');
  config = { ...CONFIG, mode: 'disabled' };
  const recovered = await (await handler(request())).json();
  expect(recovered.substitutions).toEqual(shadow.substitutions);
  expect(events.at(-1)?.jev?.outcome).toBe('disabled');
  expect(store.get).toHaveBeenCalledTimes(5);
});

test('unavailable or unapproved config fails closed only for Jev', async () => {
  const missing = new FirestoreJevRollout({ get: async () => null }, ENV);
  expect((await missing.resolve('private-owner')).reason).toBe('config_unavailable');
  const invalid = new FirestoreJevRollout({ get: async () => ({ ...CONFIG, maxCandidates: 200 }) }, ENV);
  expect((await invalid.resolve('private-owner')).reason).toBe('config_invalid');
  const model = new FirestoreJevRollout({ get: async () => ({ ...CONFIG, modelVersion: 'jev-1.12.0' }) }, ENV);
  expect((await model.resolve('private-owner')).reason).toBe('model_mismatch');
  const approval = new FirestoreJevRollout({ get: async () => ({ ...CONFIG, evaluationReference: 'unapproved' }) }, ENV);
  expect((await approval.resolve('private-owner')).reason).toBe('approval_missing');
  const master = new FirestoreJevRollout({ get: async () => { throw new Error('should not read'); } }, {});
  expect((await master.resolve('private-owner')).reason).toBe('master_disabled');
  const events: SubstitutionMetricEvent[] = [];
  const response = await setup({ get: async () => { throw new Error('offline'); } }, events, client())(request());
  expect(response.status).toBe(200);
  expect((await response.json()).rankingMode).toBe('deterministic');
  expect(events[0].jev?.outcome).toBe('config_unavailable');
});

test('candidate and cost budgets fall back before a Jev call', async () => {
  let config: unknown = { ...CONFIG, mode: 'enabled', maxCandidates: 1 };
  const mock = client();
  const events: SubstitutionMetricEvent[] = [];
  const handler = setup({ get: async () => config }, events, mock);
  const overCandidates = await (await handler(request())).json();
  expect(overCandidates.rankingMode).toBe('deterministic');
  expect(overCandidates.rankingReasonCode).toBe('SEMANTIC_FALLBACK');
  expect(events.at(-1)?.jev?.fallbackReason).toBe('candidate_limit');
  config = { ...CONFIG, mode: 'enabled', maxEstimatedCostUsd: 0.001,
    inputUsdPerMillion: 100, outputUsdPerMillion: 100 };
  const overCost = await (await handler(request())).json();
  expect(overCost.rankingMode).toBe('deterministic');
  expect(events.at(-1)?.jev?.fallbackReason).toBe('cost_limit');
  expect(mock.calls).toHaveLength(0);
});

test('upstream timeout and reported usage breach preserve deterministic order', async () => {
  const config = { ...CONFIG, mode: 'enabled' };
  const baselineEvents: SubstitutionMetricEvent[] = [];
  const baseline = await (await setup({ get: async () => ({ ...CONFIG, mode: 'disabled' }) },
    baselineEvents, client())(request())).json();
  const timeoutEvents: SubstitutionMetricEvent[] = [];
  const timeoutClient = new MockSemanticFitClient({ available: false, reason: 'timeout' });
  const timedOut = await (await setup({ get: async () => config }, timeoutEvents, timeoutClient)(request())).json();
  expect(timedOut.substitutions).toEqual(baseline.substitutions);
  expect(timeoutEvents[0].jev).toEqual(expect.objectContaining({ outcome: 'fallback', fallbackReason: 'timeout' }));

  const costEvents: SubstitutionMetricEvent[] = [];
  const costlyClient = new MockSemanticFitClient(request => ({
    available: true, model: 'jev-1.13.0', durationMs: 10,
    usage: { inputTokens: 200_000, outputTokens: 20_000 },
    answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, {
      score: 3, confidence: 0.95, probabilities: { '0': 0, '1': 0, '2': 0, '3': 1 },
    }])),
  }));
  const overActualCost = await (await setup({ get: async () => config }, costEvents, costlyClient)(request())).json();
  expect(overActualCost.substitutions).toEqual(baseline.substitutions);
  expect(costEvents[0].jev).toEqual(expect.objectContaining({ outcome: 'budget_exceeded', fallbackReason: 'cost_limit' }));
});

test('Jev metric sink emits only whitelisted aggregate fields', () => {
  const info = jest.spyOn(console, 'info').mockImplementation();
  new ConsoleSubstitutionMetrics().record({ event: 'product_substitution', outcome: 'success',
    durationMs: 20, resultCount: 2, jev: { mode: 'enabled', outcome: 'applied', candidateCount: 2,
      questionCount: 3, upstreamDurationMs: 10, confidenceBand: 'high', fallbackReason: 'private_intention',
      rankChangeCount: 2, modelVersion: 'jev-1.13.0', inputTokens: 200, outputTokens: 20,
      estimatedCostUsd: 0.001, actualCostUsd: 0.00022, uid: 'private-owner',
      intention: 'private lunchbox intention', allergies: ['Milk'], barcode: BARCODE,
    } as SubstitutionMetricEvent['jev'] });
  const serialized = info.mock.calls.flat().join(' ');
  expect(serialized).toContain('jev-1.13.0');
  expect(serialized).not.toContain('private');
  expect(serialized).not.toContain('Milk');
  expect(serialized).not.toContain(BARCODE);
  info.mockRestore();
});
