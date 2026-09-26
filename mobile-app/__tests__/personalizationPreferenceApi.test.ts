import { createPreferenceWriteHandler, type PreferenceWriteRepository } from '@/server/personalizationPreferenceHandler';
import type { TokenVerifier } from '@/server/verifiedAuth';
import type { FoodPreferenceProfile } from '@/types/Personalization';

const now = '2026-09-26T00:00:00Z';
const profile = (): FoodPreferenceProfile => ({ schemaVersion: '1.0.0', profileId: 'child', entries: [], updatedAt: now });

function request(value: unknown, authenticated = true): Request {
  return new Request('http://localhost/api/personalization/preferences', {
    method: 'PUT',
    headers: authenticated ? { Authorization: 'Bearer valid', 'Content-Type': 'application/json' } : {},
    body: JSON.stringify(value),
  });
}

describe('BE059 authenticated preference writes', () => {
  const verifier: TokenVerifier = { verifyIdToken: jest.fn().mockResolvedValue({ uid: 'owner' }) };
  const repository: PreferenceWriteRepository = {
    isActiveOwnedProfile: jest.fn().mockResolvedValue(true), write: jest.fn().mockResolvedValue(undefined),
  };
  const post = createPreferenceWriteHandler(verifier, repository);

  beforeEach(() => {
    jest.clearAllMocks();
    (repository.isActiveOwnedProfile as jest.Mock).mockResolvedValue(true);
  });

  it('writes all 32 bounded explicit entries under the verified UID', async () => {
    const p = profile();
    const pairs = [
      ...['crunchy', 'crispy', 'soft', 'chewy', 'creamy', 'smooth', 'liquid'].map(value => ({ dimension: 'texture', value })),
      ...['sweet', 'savoury', 'salty', 'sour', 'bitter', 'spicy', 'neutral'].map(value => ({ dimension: 'flavourFamily', value })),
      ...['mild', 'medium'].map(value => ({ dimension: 'flavourIntensity', value })),
    ];
    p.entries = pairs.flatMap(pair => ['like', 'avoid'].map(sentiment => ({
      ...pair, sentiment, provenance: 'explicit', confidence: 1, sourceVersion: 'mobile-1', updatedAt: now,
    }))) as FoodPreferenceProfile['entries'];
    const response = await post(request(p));
    expect(response.status).toBe(204);
    expect(repository.isActiveOwnedProfile).toHaveBeenCalledWith('owner', 'child');
    expect(repository.write).toHaveBeenCalledWith('owner', p);
  });

  it('rejects unauthenticated, foreign and missing profiles without disclosure', async () => {
    expect((await post(request(profile(), false))).status).toBe(401);
    (repository.isActiveOwnedProfile as jest.Mock).mockResolvedValue(false);
    const foreign = await post(request(profile()));
    const missing = await post(request({ ...profile(), profileId: 'missing' }));
    expect(foreign.status).toBe(409);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(repository.write).not.toHaveBeenCalled();
  });

  it('rejects inferred preferences, safety fields, arbitrary scores and oversized bodies', async () => {
    for (const invalid of [
      { ...profile(), allergies: ['milk'] },
      { ...profile(), score: 0.99 },
      { ...profile(), entries: [{ dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'inferred', confidence: 0.9, sourceVersion: 'model-1', updatedAt: now }] },
    ]) expect((await post(request(invalid))).status).toBe(400);
    expect((await post(request({ ...profile(), text: 'x'.repeat(9000) }))).status).toBe(413);
    expect(repository.write).not.toHaveBeenCalled();
  });
});
