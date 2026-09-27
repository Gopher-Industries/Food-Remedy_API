jest.mock('@/config/sqlConfig', () => ({ initialiseSQLiteDatabase: jest.fn().mockResolvedValue({}) }));
jest.mock('@/services/sqlDatabase/profiles.dao', () => ({ listProfilesForUser: jest.fn() }));
jest.mock('@/services/sqlDatabase/personalization.dao', () => ({
  getFoodPreferenceProfile: jest.fn(), listSavedShoppingIntents: jest.fn(),
  upsertFoodPreferenceProfile: jest.fn(), upsertSavedShoppingIntent: jest.fn(),
}));
jest.mock('@/services/database/user/personalization', () => ({
  getCloudFoodPreferenceProfile: jest.fn(), listCloudSavedShoppingIntents: jest.fn(),
  upsertCloudFoodPreferenceProfile: jest.fn(), upsertCloudSavedShoppingIntent: jest.fn(),
}));

import { canonicalSavedShoppingIntent, parseFoodPreferenceProfile, parseSavedShoppingIntent } from '@/services/personalizationValidation';
import { choosePersonalizationRecord, stablePersonalizationJson, syncPersonalizationForUser } from '@/services/sync/syncPersonalization';
import { listProfilesForUser } from '@/services/sqlDatabase/profiles.dao';
import { getFoodPreferenceProfile, listSavedShoppingIntents, upsertFoodPreferenceProfile, upsertSavedShoppingIntent } from '@/services/sqlDatabase/personalization.dao';
import { getCloudFoodPreferenceProfile, listCloudSavedShoppingIntents, upsertCloudFoodPreferenceProfile, upsertCloudSavedShoppingIntent } from '@/services/database/user/personalization';
import type { FoodPreferenceProfile, SavedShoppingIntent } from '@/types/Personalization';

const older = '2026-09-25T00:00:00Z';
const newer = '2026-09-26T00:00:00Z';
const pref = (profileId: string, updatedAt: string): FoodPreferenceProfile => ({
  schemaVersion: '1.0.0', profileId, entries: [], updatedAt,
});
const intent = (profileId: string, updatedAt: string): SavedShoppingIntent => ({
  schemaVersion: '1.0.0', intentId: 'intent_1', profileId, text: 'Lunchbox snack',
  provenance: 'explicit', createdAt: older, updatedAt,
});

describe('BE059 personalization persistence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates bounded explicit shapes and rejects safety or inferred values', () => {
    expect(parseFoodPreferenceProfile(pref('self', newer))).toEqual(pref('self', newer));
    expect(() => parseFoodPreferenceProfile({ ...pref('self', newer), allergies: ['milk'] })).toThrow();
    expect(() => parseFoodPreferenceProfile({ ...pref('self', newer), entries: [{
      dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'inferred',
      confidence: 0.8, sourceVersion: 'model-1', updatedAt: newer,
    }] })).toThrow();
    expect(() => parseFoodPreferenceProfile({ ...pref('self', newer), entries: Array(33).fill({}) })).toThrow();
    expect(parseSavedShoppingIntent(intent('self', newer)).text).toBe('Lunchbox snack');
    expect(() => parseSavedShoppingIntent({ ...intent('self', newer), text: 'x'.repeat(241) })).toThrow();
    expect(canonicalSavedShoppingIntent({ ...intent('self', newer), occasion: 'lunchbox', deletedAt: newer })).toEqual({
      ...intent('self', newer), text: '(deleted)', deletedAt: newer,
    });
  });

  it('resolves timestamps and ties deterministically, with deletion winning ties', () => {
    expect(choosePersonalizationRecord(pref('self', older), pref('self', newer))).toEqual(pref('self', newer));
    const active = intent('self', newer);
    const deleted = { ...active, deletedAt: newer };
    expect(choosePersonalizationRecord(active, deleted)).toEqual(deleted);
    expect(stablePersonalizationJson({ b: 1, a: 2 })).toBe(stablePersonalizationJson({ a: 2, b: 1 }));
  });

  it('synchronizes Self and child independently without rewriting equal records', async () => {
    (listProfilesForUser as jest.Mock).mockResolvedValue([
      { profileId: 'self', status: true }, { profileId: 'child', status: true },
    ]);
    const explicitSelf: FoodPreferenceProfile = { ...pref('self', newer), entries: [{
      dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'explicit',
      confidence: 1, sourceVersion: 'mobile-1', updatedAt: newer,
    }] };
    (getFoodPreferenceProfile as jest.Mock).mockImplementation((_: unknown, _uid: string, id: string) =>
      id === 'self' ? explicitSelf : null);
    (getCloudFoodPreferenceProfile as jest.Mock).mockImplementation((_uid: string, id: string) =>
      id === 'self' ? pref('self', older) : pref('child', newer));
    (listSavedShoppingIntents as jest.Mock).mockImplementation((_: unknown, _uid: string, id: string) =>
      id === 'self' ? [intent('self', newer)] : []);
    (listCloudSavedShoppingIntents as jest.Mock).mockImplementation((_uid: string, id: string) =>
      id === 'self' ? [intent('self', older)] : [intent('child', newer)]);

    await syncPersonalizationForUser('owner');

    expect(upsertCloudFoodPreferenceProfile).toHaveBeenCalledWith('owner', explicitSelf);
    expect(upsertFoodPreferenceProfile).toHaveBeenCalledWith({}, 'owner', pref('child', newer));
    expect(upsertCloudSavedShoppingIntent).toHaveBeenCalledWith('owner', intent('self', newer));
    expect(upsertSavedShoppingIntent).toHaveBeenCalledWith({}, 'owner', intent('child', newer));
    expect(upsertCloudFoodPreferenceProfile).toHaveBeenCalledTimes(1);
    expect(upsertFoodPreferenceProfile).toHaveBeenCalledTimes(1);
  });
});
