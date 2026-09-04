// ==============================
// Firebase ↔ SQLite Sync Service
// Profiles Sync 
// ==============================

import { collection, getDocs, setDoc, doc, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { fdb } from "../../config/firebaseConfig";
import { initialiseSQLiteDatabase } from "../../config/sqlConfig";
import {
  upsertProfile,
  listProfilesForUser,
} from "../sqlDatabase/profiles.dao";
import { getRequestId, safeLog } from "../backend/safeErrors";

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
  delay: number = 1000,
  requestId: string = getRequestId()
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0) throw error;

    safeLog("warn", "profile_sync.retry", { requestId, retriesRemaining: retries });
    await new Promise((res) => setTimeout(res, delay));

    return retryOperation(operation, retries - 1, delay * 2, requestId);
  }
};

const loadProfilesFromFirebase = async (userId: string, requestId: string): Promise<Profile[]> => {
  const ref = collection(fdb, "USERS", userId, "PROFILES");
  const snapshot = await retryOperation(() => getDocs(ref), 3, 1000, requestId);

  return snapshot.docs.map(
    (docSnap: QueryDocumentSnapshot<DocumentData>): Profile => ({
      profileId: docSnap.id,
      ...docSnap.data(),
    })
  );
};

// ==============================
// 1. FETCH FROM FIREBASE (CLOUD)
// ==============================
export const fetchProfilesFromFirebase = async (
  userId: string,
  requestId: string = getRequestId()
): Promise<Profile[]> => {
  try {
    return await loadProfilesFromFirebase(userId, requestId);
  } catch (error) {
    safeLog("error", "profile_sync.cloud_fetch_failed", { requestId, error });
    return [];
  }
};

// ==============================
// 2. FETCH FROM SQLITE (LOCAL)
// ==============================
export const fetchProfilesFromSQLite = async (userId: string, requestId: string = getRequestId()) => {
  try {
    const db = await initialiseSQLiteDatabase();
    return await listProfilesForUser(db, userId);
  } catch (error) {
    safeLog("error", "profile_sync.local_fetch_failed", { requestId, error });
    return [];
  }
};

// ==============================
// 3. SAVE TO SQLITE (UPSERT)
// ==============================
export const saveProfilesToSQLite = async (profiles: any[], requestId: string = getRequestId()) => {
  try {
    const db = await initialiseSQLiteDatabase();

    for (const profile of profiles) {
  const normalizedProfile = {
    ...profile,

    
    firstName: profile.firstName ?? profile.first_name ?? "Unknown",
    lastName: profile.lastName ?? profile.last_name ?? "",

    updated_at: profile.updated_at ?? new Date().toISOString(),
  };

  await upsertProfile(db, normalizedProfile);
}
    safeLog("info", "profile_sync.local_save_complete", { requestId, profileCount: profiles.length });
  } catch (error) {
    safeLog("error", "profile_sync.local_save_failed", { requestId, error });
  }
};

// ==============================
// 4. PUSH TO FIREBASE (CLOUD)
// ==============================
export const syncProfilesToCloud = async (userId: string) => {
  const requestId = getRequestId();
  try {
    const profiles = await fetchProfilesFromSQLite(userId, requestId);

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
    safeLog("error", "profile_sync.cloud_push_failed", { requestId, error });
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
  const requestId = getRequestId();
  try {
    safeLog("info", "profile_sync.started", { requestId });

    let cloudProfiles: Profile[] = [];
    let localProfiles: Profile[] = [];

    try {
      // Do not treat a failed cloud read as an empty cloud collection. Doing so
      // would make the sync write local data against an unknown cloud state.
      cloudProfiles = await loadProfilesFromFirebase(userId, requestId);
      localProfiles = await fetchProfilesFromSQLite(userId, requestId);
    } catch (err) {
      safeLog("error", "profile_sync.fetch_aborted", { requestId, error: err });
      return;
    }
    if (cloudProfiles.length === 0 && localProfiles.length === 0) {
      safeLog("info", "profile_sync.empty", { requestId });
      return;
    }

    safeLog("info", "profile_sync.loaded", {
      requestId,
      cloudProfileCount: cloudProfiles.length,
      localProfileCount: localProfiles.length,
    });

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

    // Save locally
    await saveProfilesToSQLite(finalProfiles, requestId);

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
      } catch {
        failedCount++;
      }
    }
    if (failedCount > 0) {
      safeLog("warn", "profile_sync.partial_failure", { requestId, failedCount });
    }

    safeLog("info", "profile_sync.completed", { requestId, profileCount: finalProfiles.length });
  } catch (error) {
    safeLog("error", "profile_sync.failed", { requestId, error });
  }
};
