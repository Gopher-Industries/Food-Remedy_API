import { initialiseSQLiteDatabase } from '@/config/sqlConfig';
import { listProfilesForUser } from '@/services/sqlDatabase/profiles.dao';
import {
  getFoodPreferenceProfile, listSavedShoppingIntents,
  upsertFoodPreferenceProfile, upsertSavedShoppingIntent,
} from '@/services/sqlDatabase/personalization.dao';
import {
  getCloudFoodPreferenceProfile, listCloudSavedShoppingIntents,
  upsertCloudFoodPreferenceProfile, upsertCloudSavedShoppingIntent,
} from '@/services/database/user/personalization';
import type { FoodPreferenceProfile, SavedShoppingIntent } from '@/types/Personalization';

type Versioned = { updatedAt: string; deletedAt?: string };

/** Canonical serialization removes object-key insertion order from equal-time conflicts. */
export function stablePersonalizationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stablePersonalizationJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stablePersonalizationJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Latest timestamp wins; a tie favours deletion, then canonical lexical order. */
export function choosePersonalizationRecord<T extends Versioned>(local: T | null, cloud: T | null): T | null {
  if (!local) return cloud;
  if (!cloud) return local;
  const localTime = Date.parse(local.updatedAt);
  const cloudTime = Date.parse(cloud.updatedAt);
  if (localTime !== cloudTime) return localTime > cloudTime ? local : cloud;
  if (Boolean(local.deletedAt) !== Boolean(cloud.deletedAt)) return local.deletedAt ? local : cloud;
  return stablePersonalizationJson(local) >= stablePersonalizationJson(cloud) ? local : cloud;
}

/** Runs after safety profile sync so each profile already exists on both sides. */
export async function syncPersonalizationForUser(uid: string): Promise<void> {
  const db = await initialiseSQLiteDatabase();
  const profiles = (await listProfilesForUser(db, uid)).filter(profile => profile.status);
  for (const profile of profiles) {
    const profileId = profile.profileId;
    const [localPreference, cloudPreference] = await Promise.all([
      getFoodPreferenceProfile(db, uid, profileId),
      getCloudFoodPreferenceProfile(uid, profileId),
    ]);
    const preference = choosePersonalizationRecord<FoodPreferenceProfile>(localPreference, cloudPreference);
    if (preference) {
      if (stablePersonalizationJson(localPreference) !== stablePersonalizationJson(preference)) {
        await upsertFoodPreferenceProfile(db, uid, preference);
      }
      if (stablePersonalizationJson(cloudPreference) !== stablePersonalizationJson(preference)) {
        await upsertCloudFoodPreferenceProfile(uid, preference);
      }
    }

    const [localIntents, cloudIntents] = await Promise.all([
      listSavedShoppingIntents(db, uid, profileId, true),
      listCloudSavedShoppingIntents(uid, profileId, true),
    ]);
    const localById = new Map(localIntents.map(intent => [intent.intentId, intent]));
    const cloudById = new Map(cloudIntents.map(intent => [intent.intentId, intent]));
    const ids = [...new Set([...localById.keys(), ...cloudById.keys()])].sort();
    if (ids.length > 100) throw new Error('Saved intent sync limit exceeded.');
    for (const intentId of ids) {
      const local = localById.get(intentId) ?? null;
      const cloud = cloudById.get(intentId) ?? null;
      const winner = choosePersonalizationRecord<SavedShoppingIntent>(local, cloud);
      if (!winner) continue;
      if (stablePersonalizationJson(local) !== stablePersonalizationJson(winner)) {
        await upsertSavedShoppingIntent(db, uid, winner);
      }
      if (stablePersonalizationJson(cloud) !== stablePersonalizationJson(winner)) {
        await upsertCloudSavedShoppingIntent(uid, winner);
      }
    }
  }
}
