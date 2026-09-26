import { resolvePersonalizationContext, serializePersonalizationContext,
  PersonalizationContextUnavailableError, type PersonalizationContextRepository,
  type ContextEvent } from '@/server/personalizationContext';
import type { FoodPreferenceProfile, SavedShoppingIntent, ProductSemanticAttributes } from '@/types/Personalization';

const now = Date.parse('2026-09-26T00:00:00Z');
const generatedAt = '2026-09-25T00:00:00Z';
const semantic: ProductSemanticAttributes = {
  schemaVersion: '1.0.0', evidenceCompleteness: 'partial',
  texture: { value: 'crunchy', source: 'manual', sourceVersion: 'fixture-v1', confidence: 1, generatedAt },
};

function repository(): PersonalizationContextRepository {
  return {
    getOwnedProfile: jest.fn(async (uid, profileId) => uid === 'owner' && profileId === 'child'
      ? { active: true, child: true, evidenceConsent: true } : null),
    getExplicitPreferences: jest.fn(async (): Promise<FoodPreferenceProfile> => ({
      schemaVersion: '1.0.0', profileId: 'child', updatedAt: generatedAt,
      entries: [{ dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'explicit',
        confidence: 1, sourceVersion: 'fixture-v1', updatedAt: generatedAt }],
    })),
    getSavedIntent: jest.fn(async (): Promise<SavedShoppingIntent> => ({
      schemaVersion: '1.0.0', intentId: 'lunch', profileId: 'child', text: 'Lunchbox snack',
      provenance: 'explicit', createdAt: generatedAt, updatedAt: generatedAt,
    })),
    getRecentEvents: jest.fn(async (): Promise<ContextEvent[]> => [
      { action: 'shown', candidateBarcode: 'one', occurredAt: generatedAt, receivedAt: generatedAt },
      { action: 'thumbs_down', candidateBarcode: 'one', occurredAt: generatedAt, receivedAt: generatedAt },
      { action: 'thumbs_up', candidateBarcode: 'one', occurredAt: generatedAt, receivedAt: generatedAt },
      { action: 'thumbs_up', candidateBarcode: 'one', occurredAt: '2026-08-01T00:00:00Z', receivedAt: generatedAt },
    ]),
    getProductSemantics: jest.fn(async () => semantic),
  };
}

describe('authoritative personalization context', () => {
  it('separates explicit preference, observed outcome and saved intent without identifiers or safety facts', async () => {
    const source = repository();
    const context = await resolvePersonalizationContext(source, 'owner', 'child', 'lunch', now);
    expect(context.explicit).toHaveLength(1);
    expect(context.observed).toEqual([expect.objectContaining({ dimension: 'texture', value: 'crunchy',
      sentiment: 'like', provenance: 'observed', eventCount: 1 })]);
    expect(context.inferred).toEqual([]);
    expect(context.intention?.text).toBe('Lunchbox snack');
    expect(source.getRecentEvents).toHaveBeenCalledWith('owner', 'child', 40);
    expect(source.getProductSemantics).toHaveBeenCalledTimes(1);
    expect(serializePersonalizationContext(context)).not.toMatch(/owner|child|one|allerg|medical/i);
  });

  it('returns an empty context when no preferences or evidence exist', async () => {
    const source = repository();
    source.getExplicitPreferences = async () => null;
    source.getRecentEvents = async () => [];
    const context = await resolvePersonalizationContext(source, 'owner', 'child', undefined, now);
    expect(context).toEqual({ schemaVersion: '1.0.0', explicit: [], observed: [], inferred: [], intention: null });
  });

  it('denies a foreign profile before any preference, event or product read', async () => {
    const source = repository();
    await expect(resolvePersonalizationContext(source, 'attacker', 'child', undefined, now))
      .rejects.toBeInstanceOf(PersonalizationContextUnavailableError);
    expect(source.getExplicitPreferences).not.toHaveBeenCalled();
    expect(source.getRecentEvents).not.toHaveBeenCalled();
  });

  it('does not summarize child events without consent', async () => {
    const source = repository();
    source.getOwnedProfile = async () => ({ active: true, child: true, evidenceConsent: false });
    const context = await resolvePersonalizationContext(source, 'owner', 'child', undefined, now);
    expect(context.observed).toEqual([]);
    expect(source.getRecentEvents).not.toHaveBeenCalled();
  });

  it('does not let observed negative evidence contradict an explicit like', async () => {
    const source = repository();
    source.getRecentEvents = async () => [{ action: 'thumbs_down', candidateBarcode: 'one',
      occurredAt: generatedAt, receivedAt: generatedAt }];
    const context = await resolvePersonalizationContext(source, 'owner', 'child', undefined, now);
    expect(context.explicit).toHaveLength(1);
    expect(context.observed).toEqual([]);
  });
});
