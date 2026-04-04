/*
PURPOSE:
This test file verifies that:
- Profile sync service works correctly in both directions (Firebase -> SQLite and SQLite -> Firebase).
- No duplicate profiles are created.
- Conflicts are resolved correctly using the last-write-wins strategy.
- All data is kept consistent throughout the sync process.

JEST:
 - describe() groups the related tests together into a "suite".
 - it() or ()etst defines a single test case.
 - expect() checks that a value matches what we expect.
 - beforeEach() runs setup code before every test in its describe block.
 - jest.fn() creates a "mock" - a fake version of a function 
 - jest.clearAllMocks() resets all mocks between tests so they don't bleed into each other.
*/

import {
    fetchProfilesFromFirebase,
    fetchProfilesFromSQLite,
    saveProfilesToSQLite,
    syncProfilesToCloud,
    syncProfiles,
} from '../services/sync/syncProfilesServices';

// jest.mock() intercepts the import and replaces the entire module with fakes.
// Replacing the Firebase config with a plain empty object.
jest.mock('../config/firebaseConfig', () => ({ fdb: {} }));

// Replacing all Firebase Firestore functions with jest mock functions.
// This means that when the sync service calls getDocs90, setDoc(), etc...
// It hits the fake versions instead of the real Firebase SDK.
jest.mock('firebase/firestore', () => ({
    collection: jest.fn(), // Used to reference a Firestore collection
    getDocs: jest.fn(), // Used to read documents from Firestore
    setDoc: jest.fn(), // Used to write a document to Firestore
    doc: jest.fn(), // Used to build a reference to a specific document
    getDoc: jest.fn, // Used to read a single document
}));

// Replacing the SQLite Data Access Object functions.
jest.mock('../services/sqlDatabase/profiles.dao', () => ({
    upsertProfile: jest.fn(), // INSERT OR UPDATE a profile row
    listProfilesForUser: jest.fn, // SELECT all profiles for a given userId
}));

// Importing the mocked versions to set return values and
// also inspect how many times they were called, with what areguments, etc.
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { initialiseSQLiteDatabase } from '../config/sqlConfig';
import { upsertProfile, listProfilesForUser } from '../services/sqlDatabase/profiles.dao';

// TEST HELPERS

// A fake SQLite database oject. Something to pass around so mocks can receive it.
const mockDb = {};

// Creating a fake NutritionalProfile with sensible defaults.
// Any field can be overridden by passing an object of overrides.
const makeProfile = (overrides: Record<string, any> = {}) => ({
  profileId:    'profile-001',      // unique ID for this profile in both Firebase and SQLite
  userId:       'user-123',         // the Firebase Auth user who owns this profile
  firstName:    'Test',
  lastName:     'User',
  status:       true,               // whether the profile is active
  relationship: 'self',             // e.g. 'self', 'child', 'partner'
  age:          30,
  avatarUrl:    null,
  additives:    [],                 // list of food additives to flag
  allergies:    [],                 // list of known allergies
  intolerances: [],                 // list of food intolerances
  dietaryForm:  [],                 // e.g. ['vegan', 'gluten-free']
  updated_at:   '2026-01-01T00:00:00.000Z', // ISO timestamp used for conflict resolution
  ...overrides,                     // spread overrides last so they win
});

// Creating a fake Firestore document snapshot.
// This helper mimics shape so the mocked getDocs() returns something the sync service can actually work with.
const makeFirestoreDoc = (profile: ReturnType<typeof makeProfile>) => ({
    id: profile.profileId, // Firestore document ID
    data: () => ({ ...profile }), // .data() returns the document fields
});

/* ========================================================================================================= 
SUITE 1: DOWNSTREAM SYNC - Firebase -> SQLite

These tests verify that when the app fetches profiles from the cloud,
they are correctly saved into the local SQLite database.
============================================================================================================*/

describe('Downstream sync - Firebase -> SQLite', () => {
    // Before each test in this suite, reset all mocks and make initialiseSQLiteDatabase return the fake db object.
    beforeEach(() => {
        jest.clearAllMocks();
        (initialiseSQLiteDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    it('fetches profiles from Firebase and returns them with correct shape', async () => {
        // ARRANGE: Setting up a fake profile and making getDocs return it
        const profile = makeProfile();
        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockResolvedValue({
            docs: [makeFirestoreDoc(profile)], // simulating one document in Firestore
        });

        // ACT: Call the function we are testing (Casting to any[] since Firebase returns untyped DocumentData)
        const result = await fetchProfilesFromFirebase('user-123') as any[];

        // ASSERT: Checking the return data has the right shape and values
        expect(result).toHaveLength(1); // should return exactly 1 profile
        expect(result[0].profileId).toBe('profile-001'); // profileId should be mapped correctly
        expect(result[0].userId).toBe('user-123'); // userId should be included
    });

    it('returns an empty array when Firebase is unreachable', async () => {
        // ARRANGE: Make getDocs throw an error to simulate a network failure
        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockRejectedValue(new Error ('Network error'));

        // ACT
        const result = await fetchProfilesFromFirebase('user-123');

        // ASSERT: The service should handle the error gracefully and return [], instead of crashing the app
        expect(result).toEqual([]);
    });

    it('calls upsertProfile for every profile saved to SQLite', async () => {
        // ARRANGE: Two profiles to save
        const profiles = [
            makeProfile({ profileId: 'p-001' }),
            makeProfile({ profileId: 'p-002' }),
        ];
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);

        // ACT: Save both profiles to SQLite
        await saveProfilesToSQLite(profiles);

        // ASSERT: upsertProfile (the SQL INSERT OR UPDATE) should be called once per profile, with the correct data each time
        expect(upsertProfile).toHaveBeenCalledTimes(2);
        expect(upsertProfile).toHaveBeenCalledWith(
            mockDb,
            expect.objectContaining({ profileId: 'p-001' }) // first profile
        );
        expect(upsertProfile).toHaveBeenCalledWith(
            mockDb,
            expect.objectContaining({ profileId: 'p-002' }) // second profile
        );
    });

    it('returns an empty array when SQLite is unavailable', async () => {
        // ARRANGE: Simulate SQLite failing to initialise (e.g. storage permission denied)
        (initialiseSQLiteDatabase as jest.Mock).mockRejectedValue(new Error('DB init failed'));

        // ACT
        const result = await fetchProfilesFromSQLite('user-123');

        // ASSERT: Should return [] rather than throwing an unhandled error
        expect(result).toEqual([]);
    });
});


/* =========================================================================================================
SUITE 2: UPSTREAM SYNC - SQLite -> Firebase

These tests verify that local profile data is correctly pushed back up to Firestore,
with the right paths and timestamps.
============================================================================================================*/
describe('Upstream sync - SQLite → Firebase', () => {
 
    beforeEach(() => {
        jest.clearAllMocks();
        (initialiseSQLiteDatabase as jest.Mock).mockResolvedValue(mockDb);
    });
 
    it('reads all local profiles and pushes each one to Firestore', async () => {
        // ARRANGE: Two profiles in SQLite
        const profiles = [
            makeProfile({ profileId: 'p-001' }),
            makeProfile({ profileId: 'p-002' }),
        ];
        (listProfilesForUser as jest.Mock).mockResolvedValue(profiles);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);
 
        // ACT: Push local profiles up to Firebase
        await syncProfilesToCloud('user-123');
 
        // ASSERT: Should have read from SQLite for user-123
        expect(listProfilesForUser).toHaveBeenCalledWith(mockDb, 'user-123');
        // And pushed both profiles to Firestore
        expect(setDoc).toHaveBeenCalledTimes(2);
    });
 
    it('pushes each profile to the correct Firestore path', async () => {
        // ARRANGE: One profile in SQLite
        const profile = makeProfile({ profileId: 'p-001' });
        (listProfilesForUser as jest.Mock).mockResolvedValue([profile]);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);
 
        // ACT
        await syncProfilesToCloud('user-123');
 
        // ASSERT: The Firestore document path must be:
        //   USERS / {userId} / PROFILES / {profileId}
        // If the path is wrong, the data ends up in the wrong place in Firestore.
        expect(doc).toHaveBeenCalledWith(
            {}, // fdb (mocked Firebase instance)
            'USERS', 'user-123', 'PROFILES', 'p-001'
        );
    });
 
    it('stamps an updated_at timestamp on every profile pushed to Firebase', async () => {
        // ARRANGE
        const profile = makeProfile();
        (listProfilesForUser as jest.Mock).mockResolvedValue([profile]);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);
 
        // ACT
        await syncProfilesToCloud('user-123');
 
        // ASSERT: Grab what was actually passed to setDoc and check the timestamp.
        // updated_at is what conflict resolution uses to decide
        // which version of a profile is the most recent.
        const pushedPayload = (setDoc as jest.Mock).mock.calls[0][1];
        expect(pushedPayload.updated_at).toBeDefined();
        expect(typeof pushedPayload.updated_at).toBe('string');
        expect(new Date(pushedPayload.updated_at).toString()).not.toBe('Invalid Date');
    });
});


/* =========================================================================================================
SUITE 3: DUPLICATE PROFILE PREVENTION

These tests verify that the sync does not create multiple rows for the same profile. 
============================================================================================================*/
describe('Duplicate profile prevention', () => {
 
    beforeEach(() => {
        jest.clearAllMocks();
        (initialiseSQLiteDatabase as jest.Mock).mockResolvedValue(mockDb);
    });
 
    it('upserting the same profileId twice does not create two entries', async () => {
        // ARRANGE: One profile that we will save twice
        const profile = makeProfile();
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);
 
        // ACT: Save the same profile twice (simulates two sync cycles running)
        await saveProfilesToSQLite([profile]);
        await saveProfilesToSQLite([profile]);
 
        // ASSERT: upsertProfile is called twice (once per save call)
        const calledWithIds = (upsertProfile as jest.Mock).mock.calls.map((c) => c[1].profileId);
        expect(calledWithIds).toEqual(['profile-001', 'profile-001']);
    });
 
    it('syncProfiles produces exactly one upsert when the same profileId exists in both sources', async () => {
        // ARRANGE: The same profileId exists in both Firebase and SQLite.
        const sharedId = 'profile-shared';
        const cloud    = makeProfile({ profileId: sharedId, updated_at: '2026-06-01T00:00:00.000Z' });
        const local    = makeProfile({ profileId: sharedId, updated_at: '2026-01-01T00:00:00.000Z' });
 
        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockResolvedValue({ docs: [makeFirestoreDoc(cloud)] });
        (listProfilesForUser as jest.Mock).mockResolvedValue([local]);
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);
 
        // ACT: Run the full two-way sync
        await syncProfiles('user-123');
 
        // ASSERT: The Map inside syncProfiles deduplicates by profileId,
        // only one upsert should be fired (the winning version of the profile)
        expect(upsertProfile).toHaveBeenCalledTimes(1);
    });
 
    it('syncProfiles fires one setDoc per unique profileId - no extra pushes', async () => {
        // ARRANGE: Two distinct profileIds, one in each source
        const p1 = makeProfile({ profileId: 'p-001' });
        const p2 = makeProfile({ profileId: 'p-002' });
 
        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockResolvedValue({ docs: [makeFirestoreDoc(p1)] });
        (listProfilesForUser as jest.Mock).mockResolvedValue([p2]);
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);
 
        // ACT
        await syncProfiles('user-123');
 
        // ASSERT: Two unique profiles -> exactly two setDoc calls, no duplicates
        expect(setDoc).toHaveBeenCalledTimes(2);
    });
});


/* =========================================================================================================
SUITE 4: CONFLICT RESOLUTION - LAST-WRITE-WINS

When the same profileId exists in both Firebase and SQLite with different data, the sync must pick a winner.
The resolveConflict() function inside syncProfilesServers.ts uses updated_at timestamps - whichever is more recent wins.
============================================================================================================*/
describe('Conflict resolution - last-write-wins by updated_at', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        (initialiseSQLiteDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    it('keeps the cloud version when cloud updated_at is newer', async () => {
        // ARRANGE: Cloud was updated in June, local was updated in January
        // Cloud should win
        const id = 'profile-conflict';
        const cloud = makeProfile({ profileId: id, firstName: 'CloudName', updated_at: '2026-06-01T00:00:00.000Z' });
        const local = makeProfile({ profileId: id, firstName: 'LocalName', updated_at: '2026-01-01T00:00:00.000Z' });

        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockResolvedValue({ docs: [makeFirestoreDoc(cloud)] });
        (listProfilesForUser as jest.Mock).mockResolvedValue([local]);
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);

        // ACT
        await syncProfiles('user-123');

        // ASSERT: The profile saved to SQLite should have the cloud's firstName
        const saved = (upsertProfile as jest.Mock).mock.calls[0][1];
        expect(saved.firstName).toBe('CloudName');
    });

    it('keeps the local version when local updated_at is newer', async () => {
        // ARRANGE: Local was updated in June, cloud was updated in January
        // Local should win
        const id = 'profile-conflict';
        const cloud = makeProfile({ profileId: id, firstName: 'CloudName', updated_at: '2026-01-01T00:00:00.000Z' });
        const local = makeProfile({ profileId: id, firstName: 'LocalName', updated_at: '2026-06-01T00:00:00.000Z' });

        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockResolvedValue({ docs: [makeFirestoreDoc(cloud)] });
        (listProfilesForUser as jest.Mock).mockResolvedValue([local]);
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);

        // ACT
        await syncProfiles('user-123');

        // ASSERT: The profile saved to SQLite should have the local firstName
        const saved = (upsertProfile as jest.Mock).mock.calls[0][1];
        expect(saved.firstName).toBe('LocalName');
    });

    it('defaults to the cloud version when local has no updated_at', async () => {
        //ARRANGE: Local profile has no timestamp (created before timestamps were added)
        // resolveConflict() treats a missing timestamp as epoch 0 (1970), so cloud always wins in this case
        const id = 'profile-conflict';
        const cloud = makeProfile({ profileId: id, firstName: 'CloudName', updated_at: '2026-01-01T00:00:00.000Z' });
        const local = makeProfile({ profileId: id, firstName: 'LocalName', updated_at: undefined });

        (collection as jest.Mock).mockReturnValue({});
        (getDocs as jest.Mock).mockResolvedValue({ docs: [makeFirestoreDoc(cloud)] });
        (listProfilesForUser as jest.Mock).mockResolvedValue([local]);
        (upsertProfile as jest.Mock).mockResolvedValue(undefined);
        (doc as jest.Mock).mockReturnValue({});
        (setDoc as jest.Mock).mockResolvedValue(undefined);
        
        // ACT
        await syncProfiles('user-123');

        // ASSERT
        const saved = (upsertProfile as jest.Mock).mock.calls[0][1];
        expect(saved.firstName).toBe('CloudName');
    });
});


/* =========================================================================================================
SUITE 5: DATA CONSISTENCY

These tests verify that no data is lost, corrupted, or silently dropped during the sync process. 
Every field in a profile should survive the trip from Firebase -> merge -> SQLite -> Firebase intact.
============================================================================================================*/
