jest.mock('@/config/firebaseConfig', () => ({ auth: { currentUser: { uid: 'owner', getIdToken: jest.fn().mockResolvedValue('token') } } }));
jest.mock('@/config/sqlConfig', () => ({ initialiseSQLiteDatabase: jest.fn().mockResolvedValue({}) }));
jest.mock('@/services/sqlDatabase/recommendationEvents.dao', () => ({
  listDueRecommendationEvents: jest.fn(), removeQueuedRecommendationEvent: jest.fn(),
  delayQueuedRecommendationEvent: jest.fn(),
}));

import { drainRecommendationEvents } from '@/services/sync/syncRecommendationEvents';
import { listDueRecommendationEvents, removeQueuedRecommendationEvent, delayQueuedRecommendationEvent } from '@/services/sqlDatabase/recommendationEvents.dao';

const now = Date.parse('2026-09-26T00:00:00.000Z');
const item = () => ({
  profileId: 'self', eventId: 'event_1', attemptCount: 0,
  event: { schemaVersion: '1.0.0', eventId: 'event_1', profileId: 'self',
    recommendationSessionId: 'session_1', originalBarcode: '12345678',
    candidateBarcode: '87654321', action: 'thumbs_up', occurredAt: new Date(now).toISOString() },
});

describe('BE060 offline event retry', () => {
  const originalFetch = global.fetch;
  const originalBase = process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL = 'http://localhost';
    (listDueRecommendationEvents as jest.Mock).mockResolvedValue([item()]);
  });
  afterAll(() => {
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL;
    else process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL = originalBase;
  });

  it('acknowledges both stored and duplicate responses with one stable event ID', async () => {
    for (const status of [201, 200]) {
      global.fetch = jest.fn().mockResolvedValue({ status });
      expect(await drainRecommendationEvents('owner', now)).toEqual({ delivered: 1, rejected: 0, deferred: 0 });
      expect(removeQueuedRecommendationEvent).toHaveBeenCalledWith({}, 'owner', 'self', 'event_1');
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.eventId).toBe('event_1');
      expect(body).not.toHaveProperty('receivedAt');
    }
  });

  it('backs off on service errors and drops permanently invalid events', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 503 });
    expect(await drainRecommendationEvents('owner', now)).toEqual({ delivered: 0, rejected: 0, deferred: 1 });
    expect(delayQueuedRecommendationEvent).toHaveBeenCalledWith({}, 'owner', item(), now);
    (listDueRecommendationEvents as jest.Mock).mockResolvedValue([{ ...item(), event: { ...item().event, score: 100 } }]);
    expect(await drainRecommendationEvents('owner', now)).toEqual({ delivered: 0, rejected: 1, deferred: 0 });
    expect(removeQueuedRecommendationEvent).toHaveBeenCalledWith({}, 'owner', 'self', 'event_1');
  });
});
