import { auth, fdb } from '@/config/firebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import type { FoodPreferenceProfile, SavedShoppingIntent } from '@/types/Personalization';
import { parseFoodPreferenceProfile, parseSavedShoppingIntent, canonicalSavedShoppingIntent, validPersonalizationId } from '@/services/personalizationValidation';

const profilePath = (uid: string, profileId: string) => `USERS/${uid}/PROFILES/${profileId}`;
const preferenceDoc = (uid: string, profileId: string) => doc(fdb, `${profilePath(uid, profileId)}/PERSONALIZATION/preferences`);
const intentsCol = (uid: string, profileId: string) => collection(fdb, `${profilePath(uid, profileId)}/SAVED_INTENTS`);
const intentDoc = (uid: string, profileId: string, intentId: string) => doc(fdb, `${profilePath(uid, profileId)}/SAVED_INTENTS/${intentId}`);

function requireOwner(uid: string, profileId: string): void {
  if (!validPersonalizationId(profileId) || auth.currentUser?.uid !== uid) throw new Error('Profile unavailable.');
}

async function requireActiveProfile(uid: string, profileId: string): Promise<void> {
  requireOwner(uid, profileId);
  const snapshot = await getDoc(doc(fdb, profilePath(uid, profileId)));
  const data = snapshot.data();
  if (!snapshot.exists() || data?.status === false || (data?.userId != null && data.userId !== uid)) {
    throw new Error('Profile unavailable.');
  }
}

export async function getCloudFoodPreferenceProfile(uid: string, profileId: string): Promise<FoodPreferenceProfile | null> {
  await requireActiveProfile(uid, profileId);
  const snapshot = await getDoc(preferenceDoc(uid, profileId));
  if (!snapshot.exists()) return null;
  const profile = parseFoodPreferenceProfile(snapshot.data());
  if (profile.profileId !== profileId) throw new Error('Invalid stored preference owner.');
  return profile;
}

export async function upsertCloudFoodPreferenceProfile(uid: string, input: FoodPreferenceProfile): Promise<void> {
  const profile = parseFoodPreferenceProfile(input);
  await requireActiveProfile(uid, profile.profileId);
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Authentication is required.');
  const configuredBase = process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL;
  if (!configuredBase) throw new Error('Preference sync endpoint is not configured.');
  const baseUrl = configuredBase.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/personalization/preferences`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!response.ok) throw new Error('Preference sync unavailable.');
}

export async function listCloudSavedShoppingIntents(
  uid: string, profileId: string, includeDeleted = false
): Promise<SavedShoppingIntent[]> {
  await requireActiveProfile(uid, profileId);
  const snapshot = await getDocs(intentsCol(uid, profileId));
  if (snapshot.size > 100) throw new Error('Saved intent collection exceeds the sync limit.');
  return snapshot.docs.map(item => {
    const intent = parseSavedShoppingIntent(item.data());
    if (intent.profileId !== profileId || intent.intentId !== item.id) throw new Error('Invalid stored intent owner.');
    return intent;
  }).filter(intent => includeDeleted || !intent.deletedAt).sort((a, b) => a.intentId.localeCompare(b.intentId));
}

export async function upsertCloudSavedShoppingIntent(uid: string, input: SavedShoppingIntent): Promise<void> {
  const intent = canonicalSavedShoppingIntent(input);
  await requireActiveProfile(uid, intent.profileId);
  if (!intent.deletedAt) {
    const existing = await listCloudSavedShoppingIntents(uid, intent.profileId);
    if (existing.filter(item => item.intentId !== intent.intentId).length >= 20) throw new Error('Saved intent limit reached.');
  }
  await setDoc(intentDoc(uid, intent.profileId, intent.intentId), intent);
}

export async function tombstoneCloudSavedShoppingIntent(
  uid: string, profileId: string, intentId: string, deletedAt = new Date().toISOString()
): Promise<void> {
  await requireActiveProfile(uid, profileId);
  if (!validPersonalizationId(intentId)) throw new Error('Invalid saved intent.');
  const reference = intentDoc(uid, profileId, intentId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return;
  const current = parseSavedShoppingIntent(snapshot.data());
  if (current.profileId !== profileId || current.intentId !== intentId) throw new Error('Invalid stored intent owner.');
  await setDoc(reference, canonicalSavedShoppingIntent({ ...current, updatedAt: deletedAt, deletedAt }));
}

/** Delete child documents before deleting the parent profile; Firestore does not cascade. */
export async function deleteCloudProfilePersonalization(uid: string, profileId: string): Promise<void> {
  requireOwner(uid, profileId);
  for (const name of ['RECOMMENDATION_EVENTS', 'RECOMMENDATION_SESSIONS', 'SAVED_INTENTS']) {
    const children = await getDocs(collection(fdb, `${profilePath(uid, profileId)}/${name}`));
    for (let index = 0; index < children.docs.length; index += 400) {
      const batch = writeBatch(fdb);
      for (const item of children.docs.slice(index, index + 400)) batch.delete(item.ref);
      await batch.commit();
    }
  }
  await deleteDoc(preferenceDoc(uid, profileId));
}
