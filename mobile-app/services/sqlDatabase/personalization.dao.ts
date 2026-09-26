import type { SQLiteDatabase } from 'expo-sqlite';
import type { FoodPreferenceProfile, SavedShoppingIntent } from '@/types/Personalization';
import { parseFoodPreferenceProfile, parseSavedShoppingIntent, canonicalSavedShoppingIntent } from '@/services/personalizationValidation';
import { getProfile } from './profiles.dao';

const MAX_SAVED_INTENTS = 20;

async function requireActiveLocalProfile(db: SQLiteDatabase, userId: string, profileId: string): Promise<void> {
  const profile = await getProfile(db, userId, profileId);
  if (!profile?.status) throw new Error('Profile unavailable.');
}

export async function getFoodPreferenceProfile(
  db: SQLiteDatabase, userId: string, profileId: string
): Promise<FoodPreferenceProfile | null> {
  const row = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT p.payload_json FROM profile_preferences p
     JOIN profiles owner ON owner.user_id=p.user_id AND owner.profile_id=p.profile_id
     WHERE p.user_id=? AND p.profile_id=? AND owner.status=1`, [userId, profileId]
  );
  return row ? parseFoodPreferenceProfile(JSON.parse(row.payload_json)) : null;
}

export async function upsertFoodPreferenceProfile(
  db: SQLiteDatabase, userId: string, input: FoodPreferenceProfile
): Promise<void> {
  const profile = parseFoodPreferenceProfile(input);
  await requireActiveLocalProfile(db, userId, profile.profileId);
  const payload = JSON.stringify(profile);
  if (payload.length > 8192) throw new Error('Preference profile is too large.');
  await db.runAsync(
    `INSERT INTO profile_preferences (user_id, profile_id, schema_version, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, profile_id) DO UPDATE SET
       schema_version=excluded.schema_version, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
    [userId, profile.profileId, profile.schemaVersion, payload, profile.updatedAt]
  );
}

function rowToIntent(row: Record<string, unknown>): SavedShoppingIntent {
  return parseSavedShoppingIntent({
    schemaVersion: row.schema_version,
    intentId: row.intent_id,
    profileId: row.profile_id,
    text: row.text,
    provenance: row.provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.occasion != null ? { occasion: row.occasion } : {}),
    ...(row.convenience != null ? { convenience: row.convenience } : {}),
    ...(row.deleted_at != null ? { deletedAt: row.deleted_at } : {}),
  });
}

export async function listSavedShoppingIntents(
  db: SQLiteDatabase, userId: string, profileId: string, includeDeleted = false
): Promise<SavedShoppingIntent[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT i.* FROM saved_shopping_intents i
     JOIN profiles owner ON owner.user_id=i.user_id AND owner.profile_id=i.profile_id
     WHERE i.user_id=? AND i.profile_id=? AND owner.status=1
       ${includeDeleted ? '' : 'AND i.deleted_at IS NULL'}
     ORDER BY i.intent_id ASC LIMIT 101`, [userId, profileId]
  );
  if (rows.length > 100) throw new Error('Saved intent sync limit exceeded.');
  return rows.map(rowToIntent);
}

export async function upsertSavedShoppingIntent(
  db: SQLiteDatabase, userId: string, input: SavedShoppingIntent
): Promise<void> {
  const intent = canonicalSavedShoppingIntent(input);
  await requireActiveLocalProfile(db, userId, intent.profileId);
  if (!intent.deletedAt) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM saved_shopping_intents
       WHERE user_id=? AND profile_id=? AND deleted_at IS NULL AND intent_id<>?`,
      [userId, intent.profileId, intent.intentId]
    );
    if ((row?.count ?? 0) >= MAX_SAVED_INTENTS) throw new Error('Saved intent limit reached.');
  }
  await db.runAsync(
    `INSERT INTO saved_shopping_intents
      (user_id, profile_id, intent_id, schema_version, text, occasion, convenience,
       provenance, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, profile_id, intent_id) DO UPDATE SET
       schema_version=excluded.schema_version, text=excluded.text, occasion=excluded.occasion,
       convenience=excluded.convenience, provenance=excluded.provenance,
       created_at=excluded.created_at, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [userId, intent.profileId, intent.intentId, intent.schemaVersion, intent.text,
      intent.occasion ?? null, intent.convenience ?? null, intent.provenance,
      intent.createdAt, intent.updatedAt, intent.deletedAt ?? null]
  );
}

export async function tombstoneSavedShoppingIntent(
  db: SQLiteDatabase, userId: string, profileId: string, intentId: string, deletedAt = new Date().toISOString()
): Promise<void> {
  await requireActiveLocalProfile(db, userId, profileId);
  await db.runAsync(
    `UPDATE saved_shopping_intents
     SET text='(deleted)', occasion=NULL, convenience=NULL, deleted_at=?, updated_at=?
     WHERE user_id=? AND profile_id=? AND intent_id=? AND deleted_at IS NULL`,
    [deletedAt, deletedAt, userId, profileId, intentId]
  );
}
