// Profile Provider

import { NutritionalProfile } from "@/types/NutritionalProfile";
import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  listProfilesForUser,
  createProfile as daoCreate,
  updateProfile as daoUpdate,
  deleteProfile as daoDelete,
  clearProfilesForUser as daoClear,
  upsertProfile as daoUpsert,
} from "@/services/sqlDatabase/profiles.dao";
import { listUserProfiles as listProfilesFromFirestore, deleteUserProfile } from "@/services/database/user/profiles";
import getUserProfileName from "@/services/database/user/getUserProfileName";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteProfileAvatar, getProfileAvatarDownloadUrl, isRemoteUri } from "@/services/storage/uploadProfileAvatar";
import { useSQLiteDatabase } from "./SQLiteDatabaseProvider";
import { useAuth } from "./AuthProvider";

type EditableProfile = Omit<NutritionalProfile, "age"> & { age: number | null };

interface ProfileContextType {
  profiles: NutritionalProfile[];
  selfDisplayName: string;
  isHydrated: boolean;

  // CRUD
  refresh: () => Promise<void>;
  refreshSelfDisplayName: () => Promise<void>;
  create: (
    input: Omit<NutritionalProfile, "profileId" | "userId">
  ) => Promise<NutritionalProfile>;
  update: (
    profileId: string,
    patch: Partial<NutritionalProfile>
  ) => Promise<NutritionalProfile>;
  remove: (profileId: string) => Promise<void>;
  clear: () => Promise<void>;

  // edit-mode (in-memory only until saved)
  editableProfile: EditableProfile | null;
  startEdit: (profile: NutritionalProfile) => void;
  startEditForNew: (seed?: Partial<NutritionalProfile>) => void;
  updateEdit: (updates: Partial<NutritionalProfile>) => void;
  saveEdit: (overrides?: Partial<NutritionalProfile>) => Promise<NutritionalProfile | null>;
  clearEdit: () => void;

  // active profile selection
  activeProfileId: string | null;
  activeProfile: NutritionalProfile | null;
  setActiveProfile: (profileId: string | null) => Promise<void>;

  // avatar cache management
  clearAvatarCache: (profileId?: string) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const ACTIVE_PROFILE_KEY = "foodremedy.active_profile_id";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { db, isDbReady } = useSQLiteDatabase();
  const { user } = useAuth(); // device id for now, real user later
  const userId = user?.uid;

  const [profiles, setProfiles] = useState<NutritionalProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editableProfile, setEditableProfile] = useState<EditableProfile | null>(null);
  const [hasSyncedFromCloud, setHasSyncedFromCloud] = useState<boolean>(false);
  const [hasLoadedLocal, setHasLoadedLocal] = useState<boolean>(false);
  const [selfDisplayName, setSelfDisplayName] = useState<string>("");
  const avatarUrlCacheRef = useRef<Map<string, string | null>>(new Map());

  // ----- load/refresh -----
  const refresh = useCallback(async () => {
    if (!db || !isDbReady || !userId) return;
    const rows = await listProfilesForUser(db, userId, { order: 'created_at' });
    const ordered = [...rows].sort((a, b) => {
      const aRoot = a.relationship === 'Self' ? 1 : 0;
      const bRoot = b.relationship === 'Self' ? 1 : 0;
      return bRoot - aRoot; // root first
    });

    // Render immediately with local data to avoid blocking UI on avatar lookups.
    setProfiles(ordered);
    setHasLoadedLocal(true);

    // Resolve missing avatar URLs in the background and merge in.
    const missing = ordered.filter((p) => !p.avatarUrl || !isRemoteUri(p.avatarUrl));
    if (missing.length === 0) return;

    const resolved = await Promise.all(
      missing.map(async (p) => {
        const cacheKey = `${userId}:${p.profileId}`;
        if (avatarUrlCacheRef.current.has(cacheKey)) {
          return { profileId: p.profileId, url: avatarUrlCacheRef.current.get(cacheKey) ?? null };
        }
        try {
          const url = await getProfileAvatarDownloadUrl(userId, p.profileId);
          // Add timestamp to bust image cache
          const urlWithTimestamp = url ? `${url}&t=${Date.now()}` : null;
          avatarUrlCacheRef.current.set(cacheKey, urlWithTimestamp);
          return { profileId: p.profileId, url: urlWithTimestamp };
        } catch (err) {
          console.warn('[profiles] failed to resolve avatar from storage:', err);
          avatarUrlCacheRef.current.set(cacheKey, null);
          return { profileId: p.profileId, url: null };
        }
      })
    );

    const resolvedMap = new Map(resolved.map((r) => [r.profileId, r.url]));
    setProfiles((prev) =>
      prev.map((p) => {
        const url = resolvedMap.get(p.profileId);
        if (!url) return p;
        return { ...p, avatarUrl: url };
      })
    );
  }, [db, isDbReady, userId]);

  // Load active profile ID from storage
  useEffect(() => {
    (async () => {
      if (!userId) return;
      const stored = await AsyncStorage.getItem(
        `${ACTIVE_PROFILE_KEY}.${userId}`
      );
      if (stored) {
        setActiveProfileId(stored);
      }
    })();
  }, [userId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, isDbReady, userId]);

  const refreshSelfDisplayName = useCallback(async () => {
    if (!userId) {
      setSelfDisplayName("");
      return;
    }
    try {
      const data = await getUserProfileName(userId);
      const name = [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim();
      setSelfDisplayName(name || (data?.userName ?? ""));
    } catch {
      setSelfDisplayName("");
    }
  }, [userId]);

  useEffect(() => {
    refreshSelfDisplayName();
  }, [refreshSelfDisplayName]);

  // ----- one-time cloud -> local reconcile (trust Firestore as source of truth) -----
  useEffect(() => {
    if (!db || !isDbReady || !userId) return;
    if (hasSyncedFromCloud) return;

    (async () => {
      try {
        const cloudProfiles = await listProfilesFromFirestore(userId);
        const localProfiles = await listProfilesForUser(db, userId, { order: 'created_at' });

        const cloudIds = new Set(cloudProfiles.map((p) => p.profileId));

        // Remove any local-only profiles (not present in Firestore)
        for (const lp of localProfiles) {
          if (!cloudIds.has(lp.profileId)) {
            await daoDelete(db, userId, lp.profileId);
          }
        }

        // Upsert cloud profiles into local
        for (const p of cloudProfiles) {
          await daoUpsert(db, p);
        }

        await refresh();
        setHasSyncedFromCloud(true);
      } catch (err) {
        // swallow sync errors to avoid blocking UI; can add notification if desired
        setHasSyncedFromCloud(true);
        console.error('Cloud sync (profiles) failed:', err);
      }
    })();
  }, [db, isDbReady, userId, hasSyncedFromCloud, refresh]);

  useEffect(() => {
    if (userId) return;
    avatarUrlCacheRef.current.clear();
    setProfiles([]);
    setEditableProfile(null);
    setActiveProfileId(null);
    setHasSyncedFromCloud(false);
    setHasLoadedLocal(false);
    setSelfDisplayName("");
  }, [userId]);

  // ----- CRUD -----
  const create = useCallback(async (input: Omit<NutritionalProfile, 'profileId' | 'userId'>) => {
    if (!db || !userId) throw new Error('DB or user not ready');
    const isFirst = profiles.length === 0;
    const created = await daoCreate(db, { userId, ...input, relationship: isFirst ? 'Self' : input.relationship });
    await refresh();
    return created;
  }, [db, userId, refresh, profiles.length]);

  const update = useCallback(
    async (profileId: string, patch: Partial<NutritionalProfile>) => {
      if (!db || !userId) throw new Error("DB or user not ready");
      const updated = await daoUpdate(db, userId, profileId, patch);
      await refresh();
      return updated;
    },
    [db, userId, refresh]
  );

  const remove = useCallback(async (profileId: string) => {
    if (!db || !userId) throw new Error('DB or user not ready');
    const target = profiles.find(p => p.profileId === profileId);
    if (target && target.relationship === 'Self') {
      throw new Error('Root profile cannot be deleted');
    }
    await daoDelete(db, userId, profileId);
    try {
      await deleteProfileAvatar(userId, profileId);
    } catch (e) {
      console.warn("Failed to delete profile avatar in Storage:", e);
    }
    try {
      await deleteUserProfile(userId, profileId);
    } catch (e) {
      console.warn("Failed to delete profile in Firestore:", e);
    }
    await refresh();
  }, [db, userId, refresh, profiles]);

  const clear = useCallback(async () => {
    if (!db || !userId) throw new Error("DB or user not ready");
    await daoClear(db, userId);
    setProfiles([]);
  }, [db, userId]);

  // ----- edit-mode -----
  const startEdit = useCallback((profile: NutritionalProfile) => {
    setEditableProfile({ ...profile, age: profile.age ?? null }); // clone to avoid mutating list item
  }, []);

  const startEditForNew = useCallback(
    (seed: Partial<NutritionalProfile> = {}) => {
      if (!userId) return;
      clearEdit();
      setEditableProfile({
        userId,
        profileId: uuidv4(),
        firstName: seed.firstName ?? "",
        lastName: seed.lastName ?? "",
        status: seed.status ?? true,
        relationship: seed.relationship ?? "Child",
        age: null,
        avatarUrl: seed.avatarUrl ?? "",
        additives: seed.additives ?? [],
        allergies: seed.allergies ?? [],
        intolerances: seed.intolerances ?? [],
        dietaryForm: seed.dietaryForm ?? [],
      });
    },
    [userId]
  );

  const updateEdit = useCallback((updates: Partial<NutritionalProfile>) => {
    setEditableProfile((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const clearEdit = useCallback(() => setEditableProfile(null), []);

  const saveEdit = useCallback(async (overrides: Partial<NutritionalProfile> = {}) => {
    if (!db || !userId || !editableProfile) return null;

    const merged: EditableProfile = { ...editableProfile, ...(overrides as any) };
    const toSave: NutritionalProfile = {
      ...(merged as Omit<NutritionalProfile, "age">),
      firstName: merged.firstName ?? "",
      lastName: merged.lastName ?? "",
      age: merged.age ?? 0,      // <-- coerce; or throw if you want to require age
    };

    // Ensure the first-ever profile becomes root (Self)
    try {
      const existing = await listProfilesForUser(db, userId, { limit: 1 });
      if (existing.length === 0) {
        toSave.relationship = 'Self';
      }
    } catch {}

    await daoUpsert(db, toSave);
    const after = await listProfilesForUser(db, userId, { order: "created_at" });
    const saved = after.find(p => p.profileId === merged.profileId) ?? null;
    setEditableProfile(null);
    await refresh();
    return saved;
  }, [db, userId, editableProfile, refresh]);

  // ----- active profile selection -----
  const setActiveProfile = useCallback(
    async (profileId: string | null) => {
      if (!userId) return;
      setActiveProfileId(profileId);
      if (profileId) {
        await AsyncStorage.setItem(
          `${ACTIVE_PROFILE_KEY}.${userId}`,
          profileId
        );
      } else {
        await AsyncStorage.removeItem(`${ACTIVE_PROFILE_KEY}.${userId}`);
      }
    },
    [userId]
  );

  // ----- avatar cache management -----
  const clearAvatarCache = useCallback(async (profileId?: string) => {
    if (profileId && userId) {
      // Clear cache for specific profile
      const cacheKey = `${userId}:${profileId}`;
      avatarUrlCacheRef.current.delete(cacheKey);
      // Clear the avatarUrl from the profile state to force re-fetch
      setProfiles((prev) =>
        prev.map((p) => (p.profileId === profileId ? { ...p, avatarUrl: "" } : p))
      );
    } else {
      // Clear all avatar cache
      avatarUrlCacheRef.current.clear();
      // Clear all avatarUrls from profiles state to force re-fetch
      setProfiles((prev) => prev.map((p) => ({ ...p, avatarUrl: "" })));
    }
    // Refresh profiles to fetch new avatar URLs
    await refresh();
  }, [userId, refresh]);

  const activeProfile = useMemo(() => {
    if (!activeProfileId) return null;
    return profiles.find((p) => p.profileId === activeProfileId) ?? null;
  }, [activeProfileId, profiles]);

  const value = useMemo<ProfileContextType>(() => ({
    profiles,
    selfDisplayName,
    isHydrated: hasLoadedLocal && (hasSyncedFromCloud || !userId),
    refresh, refreshSelfDisplayName, create, update, remove, clear,
    editableProfile,
    startEdit, startEditForNew, updateEdit, saveEdit, clearEdit,
    activeProfileId,
    activeProfile,
    setActiveProfile,
    clearAvatarCache,
  }), [profiles,
    selfDisplayName, hasLoadedLocal, hasSyncedFromCloud, userId, refresh, refreshSelfDisplayName, create, update, remove, clear,
    editableProfile,
    startEdit, startEditForNew, updateEdit, saveEdit, clearEdit,
    activeProfileId, activeProfile, setActiveProfile, clearAvatarCache,
  ]);

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextType {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
