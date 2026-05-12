// ==============================
// Firebase ↔ SQLite Sync Service
// Profiles Sync 
// ==============================

import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { fdb } from "../../config/firebaseConfig";
import { initialiseSQLiteDatabase } from "../../config/sqlConfig";
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import {
  upsertProfile,
  listProfilesForUser,
} from "../sqlDatabase/profiles.dao";

type Profile = {
  profileId: string;
  updated_at?: string;
  [key: string]: any;
};

// ==============================
// RETRY HELPER
// ==============================
const retryOperation = async <T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0) throw error;

    console.warn(`Retry attempt... Remaining: ${retries}`);
    await new Promise((res) => setTimeout(res, delay));

    return retryOperation(operation, retries - 1, delay * 2);
  }
};

// ==============================
// 1. FETCH FROM FIREBASE (CLOUD)
// ==============================
export const fetchProfilesFromFirebase = async (
  userId: string
): Promise<Profile[]> => {
  try {
    const ref = collection(fdb, "USERS", userId, "PROFILES");
    const snapshot = await retryOperation(() => getDocs(ref));

    return snapshot.docs.map(
      (docSnap: QueryDocumentSnapshot<DocumentData>): Profile => ({
        profileId: docSnap.id,
        ...docSnap.data(),
      })
    );
  } catch (error) {
    console.error("Firebase fetch error:", error);
    return [];
  }
};

// ==============================
// 2. FETCH FROM SQLITE (LOCAL)
// ==============================
export const fetchProfilesFromSQLite = async (userId: string) => {
  try {
    const db = await initialiseSQLiteDatabase();
    return await listProfilesForUser(db, userId);
  } catch (error) {
    console.error("SQLite fetch error:", error);
    return [];
  }
};

// ==============================
// 3. SAVE TO SQLITE (UPSERT)
// ==============================
export const saveProfilesToSQLite = async (profiles: any[]) => {
  try {
    const db = await initialiseSQLiteDatabase();

    for (const profile of profiles) {
  const normalizedProfile = {
    ...profile,

    
    firstName: profile.firstName ?? profile.first_name ?? "Unknown",
    lastName: profile.lastName ?? profile.last_name ?? "",

    updated_at: profile.updated_at ?? new Date().toISOString(),
  };

  console.log("Saving profile:", normalizedProfile);

  await upsertProfile(db, normalizedProfile);
}
  } catch (error) {
    console.error("SQLite save error:", error);
  }
};

// ==============================
// 4. PUSH TO FIREBASE (CLOUD)
// ==============================
export const syncProfilesToCloud = async (userId: string) => {
  try {
    const profiles = await fetchProfilesFromSQLite(userId);

    for (const profile of profiles) {
      await retryOperation(() =>
        setDoc(
          doc(fdb, "USERS", userId, "PROFILES", profile.profileId),
          {
            ...profile,
            updated_at: new Date().toISOString(),
          }
        )
      );
    }
  } catch (error) {
    console.error("Firebase push error:", error);
  }
};

// ==============================
// 5. CONFLICT RESOLUTION
// ==============================
const resolveConflict = (local: any, cloud: any) => {
  if (!local) return cloud;
  if (!cloud) return local;

  const localTime = new Date(local.updated_at ?? 0).getTime();
  const cloudTime = new Date(cloud.updated_at ?? 0).getTime();

  return localTime > cloudTime ? local : cloud;
};

// ==============================
// 6. MAIN SYNC FUNCTION
// ==============================
export const syncProfiles = async (userId: string) => {
  try {
    console.log(` Starting profile sync for user: ${userId}`);

    let cloudProfiles: Profile[] = [];
    let localProfiles: Profile[] = [];

    try {
      cloudProfiles = await fetchProfilesFromFirebase(userId);
      localProfiles = await fetchProfilesFromSQLite(userId);
    } catch (err) {
      console.error("Failed fetching profiles, aborting sync");
      return;
    }
    if (cloudProfiles.length === 0 && localProfiles.length === 0) {
      console.log("ℹ️ No profiles to sync");
      return;
    }

    console.log(`Cloud profiles: ${cloudProfiles.length}`);
    console.log(`Local profiles: ${localProfiles.length}`);

    const mergedMap = new Map<string, any>();

    // Add cloud profiles first
    for (const profile of cloudProfiles) {
      mergedMap.set(profile.profileId, profile);
    }

    // Merge with local profiles
    for (const profile of localProfiles) {
      const existing = mergedMap.get(profile.profileId);
      mergedMap.set(profile.profileId, resolveConflict(profile, existing));
    }

    const finalProfiles = Array.from(mergedMap.values());
    console.log(`Merged profiles: ${finalProfiles.length}`);

    // Save locally
    await saveProfilesToSQLite(finalProfiles);

    // Push back to Firebase
    let failedCount = 0;
    for (const profile of finalProfiles) {
      const cloudProfile = cloudProfiles.find(
        (p) => p.profileId === profile.profileId
      );

      const hasChanged =
        !cloudProfile ||
        new Date(profile.updated_at).getTime() >
        new Date(cloudProfile.updated_at || 0).getTime();

      try {
        if (hasChanged) {
          await retryOperation(() =>
            setDoc(
              doc(fdb, "USERS", userId, "PROFILES", profile.profileId),
              profile
            )
          );
        }
      } catch (err) {
        failedCount++;
      }
    }
    if (failedCount > 0) {
      console.warn(`${failedCount} profiles failed to sync`);
    }

    console.log(`Profile sync complete. Synced ${finalProfiles.length} profiles`);
  } catch (error) {
    console.error("Sync error:", error);
  }
};