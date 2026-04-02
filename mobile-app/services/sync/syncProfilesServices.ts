// ==============================
// Firebase ↔ SQLite Sync Service
// Profiles Sync 
// ==============================

import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { fdb } from "../../config/firebaseConfig";
import { initialiseSQLiteDatabase } from "../../config/sqlConfig";

import {
  upsertProfile,
  listProfilesForUser,
} from "../sqlDatabase/profiles.dao";

// ==============================
// 1. FETCH FROM FIREBASE (CLOUD)
// ==============================
export const fetchProfilesFromFirebase = async (userId: string) => {
  try {
    const ref = collection(fdb, "USERS", userId, "PROFILES");
    const snapshot = await getDocs(ref);

    return snapshot.docs.map((docSnap) => ({
      profileId: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("❌ Firebase fetch error:", error);
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
    console.error("❌ SQLite fetch error:", error);
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
      await upsertProfile(db, {
        ...profile,
        updated_at: profile.updated_at || new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ SQLite save error:", error);
  }
};

// ==============================
// 4. PUSH TO FIREBASE (CLOUD)
// ==============================
export const syncProfilesToCloud = async (userId: string) => {
  try {
    const profiles = await fetchProfilesFromSQLite(userId);

    for (const profile of profiles) {
      await setDoc(
        doc(fdb, "USERS", userId, "PROFILES", profile.profileId),
        {
          ...profile,
          updated_at: new Date().toISOString(),
        }
      );
    }
  } catch (error) {
    console.error("❌ Firebase push error:", error);
  }
};

// ==============================
// 5. CONFLICT RESOLUTION
// ==============================
const resolveConflict = (local: any, cloud: any) => {
  if (!local) return cloud;
  if (!cloud) return local;

  const localTime = new Date(local.updated_at || 0).getTime();
  const cloudTime = new Date(cloud.updated_at || 0).getTime();

  return localTime > cloudTime ? local : cloud;
};

// ==============================
// 6. MAIN SYNC FUNCTION
// ==============================
export const syncProfiles = async (userId: string) => {
  try {
    console.log("🔄 Starting profile sync...");

    const cloudProfiles = await fetchProfilesFromFirebase(userId);
    const localProfiles = await fetchProfilesFromSQLite(userId);

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
    await saveProfilesToSQLite(finalProfiles);

    // Push back to Firebase
    for (const profile of finalProfiles) {
      await setDoc(
        doc(fdb, "USERS", userId, "PROFILES", profile.profileId),
        profile
      );
    }

    console.log("✅ Profile sync complete");
  } catch (error) {
    console.error("❌ Sync error:", error);
  }
};