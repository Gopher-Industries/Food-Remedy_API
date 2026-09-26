import { getIntentAwareRecommendations, recordRecommendationFeedback } from '@/services/api/intentAwareRecommendations';
import { auth } from '@/config/firebaseConfig';
import { initialiseSQLiteDatabase } from '@/config/sqlConfig';
import { queueRecommendationEvent } from '@/services/sqlDatabase/recommendationEvents.dao';
import { drainRecommendationEvents } from '@/services/sync/syncRecommendationEvents';

jest.mock('uuid', () => ({ v4: () => 'stable-event-1' }));
jest.mock('@/config/firebaseConfig', () => ({ auth: { currentUser: { uid: 'owner', getIdToken: jest.fn(async () => 'token') } } }));
jest.mock('@/config/sqlConfig', () => ({ initialiseSQLiteDatabase: jest.fn(async () => ({})) }));
jest.mock('@/services/sqlDatabase/recommendationEvents.dao', () => ({ queueRecommendationEvent: jest.fn(async () => undefined) }));
jest.mock('@/services/sync/syncRecommendationEvents', () => ({ drainRecommendationEvents: jest.fn(async () => ({ delivered: 1 })) }));

const apiResponse = {
  version: '2.0.0', status: 'success',
  targetProduct: { barcode: '12345678', productName: 'Target', brand: null, nutriscoreGrade: 'c', category: 'Snacks' },
  substitutions: [{
    barcode: '87654321', productName: 'Alternative', brand: null, nutriscoreGrade: 'b',
    safetyRating: 'green', deterministicScore: 80, semanticScore: 0.91,
    semanticConfidence: 0.92, rankingMode: 'semantic', reasonCodes: ['BETTER_NUTRI_SCORE', 'SEMANTIC_FIT_APPLIED'],
  }],
  rankingMode: 'semantic', rankingReasonCode: 'SEMANTIC_CONFIDENT', emptyStateReason: null,
  recommendationSessionId: 'session-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL = 'https://api.example.test/';
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => apiResponse })) as unknown as typeof fetch;
});

test('sends an authenticated, bounded v2 request without profile or score overrides', async () => {
  const result = await getIntentAwareRecommendations({
    barcode: '12345678', profileId: 'child-1', intention: '  portable breakfast  ',
    profile: { allergies: ['secret'] }, weights: { safety: 0 },
  } as unknown as Parameters<typeof getIntentAwareRecommendations>[0]);
  const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('https://api.example.test/api/recommendations/substitutions');
  expect(options.headers.Authorization).toBe('Bearer token');
  expect(JSON.parse(options.body)).toEqual({
    version: '2.0.0', barcode: '12345678', profileId: 'child-1', limit: 5,
    intention: 'portable breakfast',
  });
  expect(result.substitutions[0]).toEqual({
    barcode: '87654321', productName: 'Alternative', brand: null, nutriscoreGrade: 'b',
    safetyRating: 'green', contextualFit: 'applied',
    reasonCodes: ['BETTER_NUTRI_SCORE', 'SEMANTIC_FIT_APPLIED'],
  });
  expect(JSON.stringify(result)).not.toContain('0.91');
  expect(initialiseSQLiteDatabase).not.toHaveBeenCalled();
});

test('uses an owned saved-intent identifier and rejects conflicting one-off text', async () => {
  await getIntentAwareRecommendations({ barcode: '12345678', profileId: 'child-1', savedIntentId: 'intent-1' });
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).savedIntentId).toBe('intent-1');
  await expect(getIntentAwareRecommendations({
    barcode: '12345678', profileId: 'child-1', savedIntentId: 'intent-1', intention: 'snack',
  })).rejects.toThrow('Invalid recommendation request.');
  await expect(getIntentAwareRecommendations({
    barcode: '12345678', profileId: 'child-1', intention: 'x'.repeat(241),
  })).rejects.toThrow('Invalid shopping intention.');
});

test('preserves deterministic fallback as a usable response', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({
    ...apiResponse, rankingMode: 'deterministic', rankingReasonCode: 'SEMANTIC_FALLBACK',
    substitutions: [{ ...apiResponse.substitutions[0], rankingMode: 'deterministic', semanticScore: null }],
  }) });
  const result = await getIntentAwareRecommendations({ barcode: '12345678', profileId: 'child-1' });
  expect(result.substitutions).toHaveLength(1);
  expect(result.rankingReasonCode).toBe('SEMANTIC_FALLBACK');
  expect(result.substitutions[0].contextualFit).toBe('not_applied');
});

test('queues one stable feedback ID and leaves retry delivery to the existing outbox', async () => {
  const result = await getIntentAwareRecommendations({ barcode: '12345678', profileId: 'child-1' });
  expect(await recordRecommendationFeedback(result, '87654321', 'thumbs_down', 'too_strong')).toBe('stable-event-1');
  expect(queueRecommendationEvent).toHaveBeenCalledWith({}, 'owner', expect.objectContaining({
    eventId: 'stable-event-1', recommendationSessionId: 'session-1',
    profileId: 'child-1', originalBarcode: '12345678', candidateBarcode: '87654321',
    action: 'thumbs_down', rejectionReason: 'too_strong',
  }));
  expect(drainRecommendationEvents).toHaveBeenCalledWith('owner');
});

test('does not fabricate feedback when no server session exists', async () => {
  const result = await getIntentAwareRecommendations({ barcode: '12345678', profileId: 'child-1' });
  delete result.recommendationSessionId;
  expect(await recordRecommendationFeedback(result, '87654321', 'opened')).toBeNull();
  expect(queueRecommendationEvent).not.toHaveBeenCalled();
  result.recommendationSessionId = 'session-1';
  await expect(recordRecommendationFeedback(result, '99999999', 'opened')).rejects.toThrow('Candidate is not in this recommendation session.');
});
