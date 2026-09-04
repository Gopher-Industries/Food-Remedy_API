import {
  fetchProfilesFromFirebase,
  fetchProfilesFromSQLite,
  saveProfilesToSQLite,
  syncProfiles,
  syncProfilesToCloud,
} from "../services/sync/syncProfilesServices";

jest.mock("../config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  doc: jest.fn(),
}));

jest.mock("../config/sqlConfig", () => ({
  initialiseSQLiteDatabase: jest.fn().mockResolvedValue({}),
}));

jest.mock("../services/sqlDatabase/profiles.dao", () => ({
  upsertProfile: jest.fn().mockResolvedValue(undefined),
  listProfilesForUser: jest.fn().mockResolvedValue([]),
}));

import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { initialiseSQLiteDatabase } from "../config/sqlConfig";
import {
  listProfilesForUser,
  upsertProfile,
} from "../services/sqlDatabase/profiles.dao";

const mockDb = {};
const userId = "user-123";

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  profileId: "profile-001",
  userId,
  firstName: "Test",
  lastName: "User",
  status: true,
  relationship: "Self",
  age: 30,
  avatarUrl: "",
  additives: [],
  allergies: [],
  intolerances: [],
  dietaryForm: [],
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const firestoreDoc = (profile: ReturnType<typeof makeProfile>) => ({
  id: profile.profileId,
  data: () => ({ ...profile }),
});

async function settleWithFakeTimers<T>(operation: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return operation;
}

describe("profile sync", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    (initialiseSQLiteDatabase as jest.Mock).mockResolvedValue(mockDb);
    (collection as jest.Mock).mockReturnValue({});
    (doc as jest.Mock).mockReturnValue({});
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    (listProfilesForUser as jest.Mock).mockResolvedValue([]);
    (upsertProfile as jest.Mock).mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(console, "log").mockImplementation();
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("maps Firestore documents to profiles", async () => {
    const profile = makeProfile();
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(profile)] });

    await expect(fetchProfilesFromFirebase(userId)).resolves.toEqual([profile]);
    expect(collection).toHaveBeenCalledWith({}, "USERS", userId, "PROFILES");
  });

  it("retries a failed Firebase read three times before returning an empty list", async () => {
    jest.useFakeTimers();
    (getDocs as jest.Mock).mockRejectedValue(new Error("network unavailable"));

    const result = await settleWithFakeTimers(fetchProfilesFromFirebase(userId));

    expect(result).toEqual([]);
    expect(getDocs).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("returns an empty list when SQLite cannot be initialised", async () => {
    (initialiseSQLiteDatabase as jest.Mock).mockRejectedValue(new Error("database unavailable"));

    await expect(fetchProfilesFromSQLite(userId)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "SQLite fetch error:",
      expect.any(Error)
    );
  });

  it("normalises profile names before saving every profile to SQLite", async () => {
    const profile = makeProfile({
      profileId: "profile-002",
      first_name: "Snake",
      firstName: undefined,
      last_name: "Case",
      lastName: undefined,
    });

    await saveProfilesToSQLite([profile]);

    expect(upsertProfile).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        profileId: "profile-002",
        firstName: "Snake",
        lastName: "Case",
        updated_at: expect.any(String),
      })
    );
  });

  it("retries a transient profile write and preserves the cloud path", async () => {
    jest.useFakeTimers();
    const profile = makeProfile({ profileId: "offline-profile" });
    (listProfilesForUser as jest.Mock).mockResolvedValue([profile]);
    (setDoc as jest.Mock)
      .mockRejectedValueOnce(new Error("temporary write failure"))
      .mockRejectedValueOnce(new Error("temporary write failure"))
      .mockResolvedValueOnce(undefined);

    await settleWithFakeTimers(syncProfilesToCloud(userId));

    expect(setDoc).toHaveBeenCalledTimes(3);
    expect(doc).toHaveBeenCalledWith(
      {},
      "USERS",
      userId,
      "PROFILES",
      "offline-profile"
    );
    expect(setDoc).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        profileId: "offline-profile",
        updated_at: expect.any(String),
      })
    );
  });

  it("keeps the local version and writes it when the local timestamp is newer", async () => {
    const cloud = makeProfile({
      profileId: "shared-profile",
      firstName: "Cloud",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const local = makeProfile({
      profileId: "shared-profile",
      firstName: "Local",
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(cloud)] });
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await syncProfiles(userId);

    expect(upsertProfile).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ firstName: "Local" })
    );
    expect(setDoc).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ firstName: "Local" })
    );
  });

  it("keeps the cloud version when the cloud timestamp is newer", async () => {
    const cloud = makeProfile({
      profileId: "shared-profile",
      firstName: "Cloud",
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const local = makeProfile({
      profileId: "shared-profile",
      firstName: "Local",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(cloud)] });
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await syncProfiles(userId);

    expect(upsertProfile).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ firstName: "Cloud" })
    );
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("preserves all fields from the winning profile", async () => {
    const cloud = makeProfile({
      profileId: "complete-profile",
      firstName: "Alice",
      lastName: "Smith",
      relationship: "Child",
      age: 12,
      additives: ["E330"],
      allergies: ["peanuts", "dairy"],
      intolerances: ["gluten"],
      dietaryForm: ["vegan"],
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const local = makeProfile({
      profileId: "complete-profile",
      firstName: "Older local value",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(cloud)] });
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await syncProfiles(userId);

    expect(upsertProfile).toHaveBeenCalledWith(mockDb, cloud);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("keeps the cloud version when timestamps are equal", async () => {
    const cloud = makeProfile({
      profileId: "shared-profile",
      firstName: "Cloud",
    });
    const local = makeProfile({
      profileId: "shared-profile",
      firstName: "Local",
    });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(cloud)] });
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await syncProfiles(userId);

    expect(upsertProfile).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ firstName: "Cloud" })
    );
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("keeps the cloud version when the local timestamp is missing", async () => {
    const cloud = makeProfile({
      profileId: "shared-profile",
      firstName: "Cloud",
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const local = makeProfile({
      profileId: "shared-profile",
      firstName: "Local",
      updated_at: undefined,
    });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(cloud)] });
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await syncProfiles(userId);

    expect(upsertProfile).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ firstName: "Cloud" })
    );
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("keeps all unique profiles but only writes local-only profiles to Firestore", async () => {
    const cloud = makeProfile({ profileId: "cloud-profile" });
    const local = makeProfile({ profileId: "local-profile" });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [firestoreDoc(cloud)] });
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await syncProfiles(userId);

    expect(upsertProfile).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "local-profile" })
    );
  });

  it("does not save or write when neither store contains a profile", async () => {
    await syncProfiles(userId);

    expect(upsertProfile).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("does not write local profiles when the Firebase read fails", async () => {
    jest.useFakeTimers();
    const local = makeProfile({ profileId: "local-profile" });
    (getDocs as jest.Mock).mockRejectedValue(new Error("network unavailable"));
    (listProfilesForUser as jest.Mock).mockResolvedValue([local]);

    await settleWithFakeTimers(syncProfiles(userId));

    expect(upsertProfile).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed fetching profiles, aborting sync"
    );
  });

  it("continues syncing later profiles after one write exhausts its retries", async () => {
    jest.useFakeTimers();
    const failedProfile = makeProfile({ profileId: "failed-profile" });
    const successfulProfile = makeProfile({ profileId: "successful-profile" });
    (listProfilesForUser as jest.Mock).mockResolvedValue([
      failedProfile,
      successfulProfile,
    ]);
    (setDoc as jest.Mock)
      .mockRejectedValueOnce(new Error("write failed"))
      .mockRejectedValueOnce(new Error("write failed"))
      .mockRejectedValueOnce(new Error("write failed"))
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(undefined);

    await settleWithFakeTimers(syncProfiles(userId));

    expect(setDoc).toHaveBeenCalledTimes(5);
    expect(setDoc).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({ profileId: "successful-profile" })
    );
    expect(warnSpy).toHaveBeenCalledWith("1 profiles failed to sync");
  });
});
