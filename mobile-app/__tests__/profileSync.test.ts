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
