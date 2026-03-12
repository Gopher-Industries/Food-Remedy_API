import { v4 as uuidv4 } from 'uuid';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { fdb } from '@/config/firebaseConfig';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import { deleteProfileAvatar } from '@/services/storage/uploadProfileAvatar';

const usersCol = (uid: string) => doc(fdb, `USERS/${uid}`);
const profilesCol = (uid: string) => collection(fdb, `USERS/${uid}/PROFILES`);
const profileDoc = (uid: string, profileId: string) => doc(fdb, `USERS/${uid}/PROFILES/${profileId}`);

const nowIso = () => new Date().toISOString();

const withoutNames = <T extends Partial<NutritionalProfile>>(data: T) => {
  // Only strip firstName/lastName for Self profiles (they come from USERS doc)
  // Keep them for non-Self profiles (Child, Sibling, etc.)
  if (data.relationship === 'Self') {
    const { firstName, lastName, ...rest } = data as any;
    return rest as Omit<T, "firstName" | "lastName">;
  }
  return data;
};

const withEmptyNames = (data: Partial<NutritionalProfile>): NutritionalProfile => ({
  ...(data as NutritionalProfile),
  // For Self profiles, firstName/lastName come from USERS doc, so use empty strings
  // For non-Self profiles, use what's stored in the PROFILES subcollection
  firstName: data.relationship === 'Self' ? "" : (data.firstName ?? ""),
  lastName: data.relationship === 'Self' ? "" : (data.lastName ?? ""),
});

export async function createUserProfile(
  uid: string,
  input: Omit<NutritionalProfile, 'profileId' | 'userId'>
): Promise<NutritionalProfile> {
  const profileId = uuidv4();
  const payload: NutritionalProfile & { createdAt: string; updatedAt: string } = {
    ...(withoutNames(input) as any),
    userId: uid,
    profileId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  } as any;

  await setDoc(profileDoc(uid, profileId), payload);
  return (await getUserProfile(uid, profileId))!;
}

export async function getUserProfile(uid: string, profileId: string): Promise<NutritionalProfile | null> {
  const snap = await getDoc(profileDoc(uid, profileId));
  return snap.exists() ? withEmptyNames(snap.data() as NutritionalProfile) : null;
}

export async function listUserProfiles(uid: string): Promise<NutritionalProfile[]> {
  const snap = await getDocs(profilesCol(uid));
  return snap.docs.map(d => withEmptyNames(d.data() as NutritionalProfile));
}

export async function updateUserProfile(
  uid: string,
  profileId: string,
  patch: Partial<NutritionalProfile>
): Promise<void> {
  const payload: any = {
    ...withoutNames(patch),
    updatedAt: nowIso(),
  };
  
  // Only delete firstName/lastName fields for Self profiles
  if (patch.relationship === 'Self') {
    payload.firstName = deleteField();
    payload.lastName = deleteField();
  }
  
  await updateDoc(profileDoc(uid, profileId), payload);
}

// Create or update a profile by a specific id (used by edit/save flow)
export async function upsertUserProfile(
  uid: string,
  profileId: string,
  data: NutritionalProfile
): Promise<void> {
  const payload: any = {
    ...(withoutNames(data) as any),
    userId: uid,
    profileId,
    updatedAt: nowIso(),
  };
  
  // Only delete firstName/lastName fields for Self profiles
  if (data.relationship === 'Self') {
    payload.firstName = deleteField();
    payload.lastName = deleteField();
  }
  
  await setDoc(profileDoc(uid, profileId), payload, { merge: true });
}

export async function deleteUserProfile(uid: string, profileId: string): Promise<void> {
  try {
    await deleteProfileAvatar(uid, profileId);
  } catch (e) {
    console.warn('Failed to delete profile avatar in Storage:', e);
  }
  await deleteDoc(profileDoc(uid, profileId));
}

export default {
  createUserProfile,
  getUserProfile,
  listUserProfiles,
  updateUserProfile,
  deleteUserProfile,
  upsertUserProfile,
};
