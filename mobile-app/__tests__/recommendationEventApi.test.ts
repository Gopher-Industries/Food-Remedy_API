import { createRecommendationEventHandler, type EventIngestionRepository } from '@/server/recommendationEventHandler';
import type { TokenVerifier } from '@/server/verifiedAuth';

const event = () => ({
  schemaVersion: '1.0.0', eventId: 'event_1', profileId: 'self', recommendationSessionId: 'session_1',
  originalBarcode: '12345678', candidateBarcode: '87654321', action: 'thumbs_up',
  occurredAt: new Date().toISOString(),
});
const request = (value: unknown, authenticated = true) => new Request('http://localhost/api/recommendations/events', {
  method: 'POST', headers: authenticated ? { Authorization: 'Bearer verified' } : {}, body: JSON.stringify(value),
});

describe('BE060 event ingestion API', () => {
  const verifier: TokenVerifier = { verifyIdToken: jest.fn().mockResolvedValue({ uid: 'owner' }) };
  const repository: EventIngestionRepository = { ingest: jest.fn().mockResolvedValue('stored') };
  const post = createRecommendationEventHandler(verifier, repository);

  beforeEach(() => { jest.clearAllMocks(); (repository.ingest as jest.Mock).mockResolvedValue('stored'); });

  it('stores an owned event once and acknowledges an idempotent retry', async () => {
    const first = await post(request(event()));
    expect(first.status).toBe(201);
    expect(repository.ingest).toHaveBeenCalledWith('owner', expect.objectContaining({ eventId: 'event_1' }));
    (repository.ingest as jest.Mock).mockResolvedValue('duplicate');
    const retry = await post(request(event()));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ status: 'duplicate', eventId: 'event_1' });
  });

  it('rejects unauthenticated, client scores, safety data, model IDs and oversized payloads', async () => {
    expect((await post(request(event(), false))).status).toBe(401);
    for (const field of ['allergies', 'rankingScore', 'modelVersion', 'rawIntention', 'receivedAt']) {
      expect((await post(request({ ...event(), [field]: field === 'allergies' ? ['milk'] : 'forged' }))).status).toBe(400);
    }
    expect((await post(request({ ...event(), filler: 'x'.repeat(3000) }))).status).toBe(413);
    expect(repository.ingest).not.toHaveBeenCalled();
  });

  it('does not distinguish foreign, fabricated and conflicting sessions', async () => {
    const responses: unknown[] = [];
    for (const outcome of ['unavailable', 'conflict']) {
      (repository.ingest as jest.Mock).mockResolvedValue(outcome);
      const response = await post(request(event()));
      expect(response.status).toBe(409);
      responses.push(await response.json());
    }
    expect(responses[0]).toEqual(responses[1]);
  });

  it('permits controlled reasons only for negative feedback', async () => {
    expect((await post(request({ ...event(), action: 'thumbs_down', rejectionReason: 'wrong_texture' }))).status).toBe(201);
    expect((await post(request({ ...event(), action: 'shown', rejectionReason: 'messy' }))).status).toBe(400);
    expect((await post(request({ ...event(), action: 'thumbs_down', rejectionReason: 'dislike_user' }))).status).toBe(400);
  });
});
