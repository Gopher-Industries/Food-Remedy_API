// db/profiles.dao.ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import type { NutritionalProfile } from '@/types/NutritionalProfile';

const nowIso = () => new Date().toISOString();
const J = (v: unknown) => JSON.stringify(v ?? []);
const parseArr = (s: string | null) => {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
};

// Row -> Model
function rowToProfile(r: any): NutritionalProfile {
  return {
    userId: r.user_id,
    profileId: r.profile_id,
    firstName: r.first_name,
    lastName: r.last_name,
    status: !!r.status,
    relationship: r.relationship,
    age: Number(r.age),
    avatarUrl: r.avatar_url,
    additives: parseArr(r.additives_json),
    allergies: parseArr(r.allergies_json),
    intolerances: parseArr(r.intolerances_json),
    dietaryForm: parseArr(r.dietary_form_json),
  };
}

/** Create (generates profileId). Returns created profile. */
export async function createProfile(
  db: SQLiteDatabase,
  input: Omit<NutritionalProfile, 'profileId'>
): Promise<NutritionalProfile> {
  const profileId = uuidv4();
  const ts = nowIso();

  await db.runAsync(
    `INSERT INTO profiles (
      profile_id, user_id, first_name, last_name, status, relationship, age, avatar_url,
      additives_json, allergies_json, intolerances_json, dietary_form_json,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      profileId, input.userId, input.firstName, input.lastName, input.status ? 1 : 0,
      input.relationship, input.age, input.avatarUrl,
      J(input.additives), J(input.allergies), J(input.intolerances), J(input.dietaryForm),
      ts, ts
    ]
  );

  const created = await getProfile(db, input.userId, profileId);
  if (!created) throw new Error('createProfile: failed to read back inserted row');
  return created;
}

/** Upsert by profileId (insert or update). */
export async function upsertProfile(
  db: SQLiteDatabase,
  profile: NutritionalProfile
): Promise<void> {
  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO profiles (
      profile_id, user_id, first_name, last_name, status, relationship, age, avatar_url,
      additives_json, allergies_json, intolerances_json, dietary_form_json,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(profile_id) DO UPDATE SET
      user_id=excluded.user_id,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      status=excluded.status,
      relationship=excluded.relationship,
      age=excluded.age,
      avatar_url=excluded.avatar_url,
      additives_json=excluded.additives_json,
      allergies_json=excluded.allergies_json,
      intolerances_json=excluded.intolerances_json,
      dietary_form_json=excluded.dietary_form_json,
      updated_at=excluded.updated_at`,
    [
      profile.profileId, profile.userId, profile.firstName, profile.lastName, profile.status ? 1 : 0,
      profile.relationship, profile.age, profile.avatarUrl,
      J(profile.additives), J(profile.allergies), J(profile.intolerances), J(profile.dietaryForm),
      ts, ts
    ]
  );
}

/** Update partial (read, merge, write). Returns updated profile. */
export async function updateProfile(
  db: SQLiteDatabase,
  userId: string,
  profileId: string,
  patch: Partial<NutritionalProfile>
): Promise<NutritionalProfile> {
  const current = await getProfile(db, userId, profileId);
  if (!current) throw new Error(`updateProfile: not found userId=${userId} profileId=${profileId}`);

  const merged: NutritionalProfile = {
    ...current,
    ...patch,
    userId,            // enforce ownership
    profileId,         // enforce target
    additives: patch.additives ?? current.additives,
    allergies: patch.allergies ?? current.allergies,
    intolerances: patch.intolerances ?? current.intolerances,
    dietaryForm: patch.dietaryForm ?? current.dietaryForm,
  };

  await upsertProfile(db, merged);
  const updated = await getProfile(db, userId, profileId);
  if (!updated) throw new Error('updateProfile: failed to read back');
  return updated;
}

/** Get single profile (scoped to user). */
export async function getProfile(
  db: SQLiteDatabase,
  userId: string,
  profileId: string
): Promise<NutritionalProfile | null> {
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM profiles WHERE profile_id=? AND user_id=?`,
    [profileId, userId]
  );
  return row ? rowToProfile(row) : null;
}

/** List profiles for a user. */
export async function listProfilesForUser(
  db: SQLiteDatabase,
  userId: string,
  opts?: { limit?: number; offset?: number; order?: 'created_at' | 'updated_at' | 'first_name' }
): Promise<NutritionalProfile[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const orderCol =
    opts?.order === 'updated_at' ? 'updated_at' :
      opts?.order === 'first_name' ? 'first_name' : 'created_at';

  const rows = await db.getAllAsync<any>(
    `SELECT * FROM profiles WHERE user_id=? ORDER BY ${orderCol} ASC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows.map(rowToProfile);
}

/** Delete profile (scoped to user). */
export async function deleteProfile(
  db: SQLiteDatabase,
  userId: string,
  profileId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM profiles WHERE profile_id=? AND user_id=?`, [profileId, userId]);
}

/** Delete all profiles for a user (rarely needed). */
export async function clearProfilesForUser(db: SQLiteDatabase, userId: string): Promise<void> {
  await db.runAsync(`DELETE FROM profiles WHERE user_id=?`, [userId]);
}
