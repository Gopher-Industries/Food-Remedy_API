import {
  openSubstitutionProduct,
  recommendationReason,
  ScanSubstitutionCoordinator,
  type ScanSubstitutionState,
} from '@/services/scanSubstitutionFlow';
import {
  RecommendationRequestError,
  type IntentAwareResult,
} from '@/services/api/intentAwareRecommendations';

jest.mock('@/config/firebaseConfig', () => ({ auth: { currentUser: null } }));
jest.mock('@/config/sqlConfig', () => ({ initialiseSQLiteDatabase: jest.fn() }));
jest.mock('@/services/sqlDatabase/recommendationEvents.dao', () => ({ queueRecommendationEvent: jest.fn() }));
jest.mock('@/services/sync/syncRecommendationEvents', () => ({ drainRecommendationEvents: jest.fn() }));

function result(
  barcode = '12345678',
  profileId = 'profile-1',
  status: IntentAwareResult['status'] = 'success',
): IntentAwareResult {
  return {
    status,
    targetProduct: { barcode, productName: 'Target', brand: null, nutriscoreGrade: 'c', category: 'Snacks' },
    substitutions: status === 'success' ? [{
      barcode: '87654321', productName: 'Alternative', brand: 'Brand', nutriscoreGrade: 'b',
      safetyRating: 'green', reasonCodes: ['MATCH_CATEGORY_EXACT', 'LOWER_SUGAR'],
      contextualFit: 'not_applied',
    }] : [],
    rankingMode: 'deterministic',
    rankingReasonCode: 'DETERMINISTIC_BASELINE',
    emptyStateReason: status === 'success' ? null : 'STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES',
    profileId,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('publishes API alternatives and human-readable reasons', async () => {
  const states: ScanSubstitutionState[] = [];
  const coordinator = new ScanSubstitutionCoordinator(async () => result(), state => states.push(state));
  await coordinator.load({ barcode: '12345678', profileId: 'profile-1' });
  expect(states.map(state => state.status)).toEqual(['loading', 'success']);
  const item = result().substitutions[0];
  expect(recommendationReason(item)).toBe('Same product category • Lower sugar per 100 g');
});

test('shows the safe empty state returned by the backend', async () => {
  const states: ScanSubstitutionState[] = [];
  const coordinator = new ScanSubstitutionCoordinator(
    async () => result('12345678', 'profile-1', 'no_eligible_candidates'),
    state => states.push(state),
  );
  await coordinator.load({ barcode: '12345678', profileId: 'profile-1' });
  expect(states.at(-1)).toEqual(expect.objectContaining({
    status: 'empty',
    message: expect.stringContaining('safety requirements'),
  }));
});

test('a rapid rescan cannot overwrite the newer barcode response', async () => {
  const first = deferred<IntentAwareResult>();
  const second = deferred<IntentAwareResult>();
  const states: ScanSubstitutionState[] = [];
  const fetcher = jest.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const coordinator = new ScanSubstitutionCoordinator(fetcher, state => states.push(state));

  const firstLoad = coordinator.load({ barcode: '12345678', profileId: 'profile-1' });
  const secondLoad = coordinator.load({ barcode: '23456789', profileId: 'profile-1' });
  second.resolve(result('23456789'));
  await secondLoad;
  first.resolve(result('12345678'));
  await firstLoad;

  const successes = states.filter(state => state.status === 'success');
  expect(successes).toHaveLength(1);
  expect(successes[0]).toEqual(expect.objectContaining({
    result: expect.objectContaining({ targetProduct: expect.objectContaining({ barcode: '23456789' }) }),
  }));
});

test('a profile change invalidates the previous profile response', async () => {
  const first = deferred<IntentAwareResult>();
  const second = deferred<IntentAwareResult>();
  const states: ScanSubstitutionState[] = [];
  const fetcher = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const coordinator = new ScanSubstitutionCoordinator(fetcher, state => states.push(state));

  const childOne = coordinator.load({ barcode: '12345678', profileId: 'child-1' });
  const childTwo = coordinator.load({ barcode: '12345678', profileId: 'child-2' });
  second.resolve(result('12345678', 'child-2'));
  await childTwo;
  first.resolve(result('12345678', 'child-1'));
  await childOne;

  const final = states.at(-1);
  expect(final).toEqual(expect.objectContaining({
    status: 'success', result: expect.objectContaining({ profileId: 'child-2' }),
  }));
});

test.each([
  ['offline', 'offline'],
  ['timeout', 'timeout'],
  ['unavailable', 'error'],
] as const)('maps %s failures to an explicit UI state', async (code, expected) => {
  const states: ScanSubstitutionState[] = [];
  const coordinator = new ScanSubstitutionCoordinator(
    async () => { throw new RecommendationRequestError(code, code); },
    state => states.push(state),
  );
  await coordinator.load({ barcode: '12345678', profileId: 'profile-1' });
  expect(states.at(-1)?.status).toBe(expected);
});

test('opening an eligible alternative changes the product lifecycle and navigates', () => {
  const setBarcode = jest.fn();
  const navigate = jest.fn();
  openSubstitutionProduct('87654321', setBarcode, navigate);
  expect(setBarcode).toHaveBeenCalledWith('87654321');
  expect(navigate).toHaveBeenCalledTimes(1);
});
