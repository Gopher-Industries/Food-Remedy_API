/*
PURPOSE:
This test file verifies that deleteUserAccountData removes a user's data
in the correct order and targets the correct Firestore paths.

The account deletion process should:
1. Delete profile storage first.
2. Read the user's profile documents from Firestore.
3. Delete profile documents using Firestore batches.
4. Delete the main user document last.

All Firebase and Storage functions are mocked so these tests do not
delete any real user data.
*/

import { deleteUserAccountData } from '../services/database/user/deleteUserAccount';
import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { deleteUserProfilesStorage } from '../services/storage/uploadProfileAvatar';

// Replace Firebase config with a fake Firestore object.
jest.mock('../config/firebaseConfig', () => ({
  fdb: {},
}));

// Replace Firebase Firestore functions with mocks.
// This prevents the tests from connecting to the real Firebase database.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  writeBatch: jest.fn(),
}));

// Replace Storage cleanup with a mock.
// No real Firebase Storage files will be deleted.
jest.mock('../services/storage/uploadProfileAvatar', () => ({
  deleteUserProfilesStorage: jest.fn(),
}));

describe('deleteUserAccountData', () => {
  const uid = 'user-123';

  // Stable fake Firestore references so we can verify
  // that the correct references are used during deletion.
  const mockProfilesCollectionRef = {
    path: `USERS/${uid}/PROFILES`,
  };

  const mockUserDocRef = {
    path: `USERS/${uid}`,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Return fake references instead of connecting to Firestore.
    (collection as jest.Mock).mockReturnValue(mockProfilesCollectionRef);
    (doc as jest.Mock).mockReturnValue(mockUserDocRef);

    // Storage cleanup succeeds by default.
    (deleteUserProfilesStorage as jest.Mock).mockResolvedValue(undefined);

    // Final user document deletion succeeds by default.
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
  });

  it('deletes profile storage before starting Firestore cleanup', async () => {
    // ARRANGE
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [],
    });

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT
    expect(deleteUserProfilesStorage).toHaveBeenCalledWith(uid);
    expect(getDocs).toHaveBeenCalledTimes(1);

    const storageCall =
      (deleteUserProfilesStorage as jest.Mock).mock.invocationCallOrder[0];

    const firestoreCall =
      (getDocs as jest.Mock).mock.invocationCallOrder[0];

    expect(storageCall).toBeLessThan(firestoreCall);
  });

  it('uses the correct Firestore profile collection path', async () => {
    // ARRANGE
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [],
    });

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT
    expect(collection).toHaveBeenCalledWith(
      {},
      `USERS/${uid}/PROFILES`
    );

    expect(getDocs).toHaveBeenCalledWith(mockProfilesCollectionRef);
  });

  it('deletes profile documents using a Firestore batch', async () => {
    // ARRANGE
    const profileDocs = [
      { ref: { id: 'profile-1' } },
      { ref: { id: 'profile-2' } },
    ];

    (getDocs as jest.Mock).mockResolvedValue({
      docs: profileDocs,
    });

    const mockBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    (writeBatch as jest.Mock).mockReturnValue(mockBatch);

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT
    expect(mockBatch.delete).toHaveBeenCalledTimes(2);

    expect(mockBatch.delete).toHaveBeenCalledWith(
      profileDocs[0].ref
    );

    expect(mockBatch.delete).toHaveBeenCalledWith(
      profileDocs[1].ref
    );

    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });

  it('creates another batch when more than 450 profile documents exist', async () => {
    // ARRANGE
    // The implementation commits after 450 documents.
    // 451 documents should therefore require two batches.
    const profileDocs = Array.from(
      { length: 451 },
      (_, index) => ({
        ref: { id: `profile-${index + 1}` },
      })
    );

    (getDocs as jest.Mock).mockResolvedValue({
      docs: profileDocs,
    });

    const firstBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    const secondBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    (writeBatch as jest.Mock)
      .mockReturnValueOnce(firstBatch)
      .mockReturnValueOnce(secondBatch);

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT
    expect(firstBatch.delete).toHaveBeenCalledTimes(450);
    expect(firstBatch.commit).toHaveBeenCalledTimes(1);

    expect(secondBatch.delete).toHaveBeenCalledTimes(1);
    expect(secondBatch.commit).toHaveBeenCalledTimes(1);

    expect(writeBatch).toHaveBeenCalledTimes(2);
  });

  it('uses the correct user document path and deletes that exact document last', async () => {
    // ARRANGE
    const profileDocs = [
      { ref: { id: 'profile-1' } },
      { ref: { id: 'profile-2' } },
    ];

    (getDocs as jest.Mock).mockResolvedValue({
      docs: profileDocs,
    });

    const mockBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    (writeBatch as jest.Mock).mockReturnValue(mockBatch);

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT
    // The correct main user document path must be created.
    expect(doc).toHaveBeenCalledWith(
      {},
      `USERS/${uid}`
    );

    // deleteDoc must receive that exact user document reference.
    expect(deleteDoc).toHaveBeenCalledWith(mockUserDocRef);

    // Profile deletions must complete before the user document is deleted.
    const batchCommitCall =
      mockBatch.commit.mock.invocationCallOrder[0];

    const userDeleteCall =
      (deleteDoc as jest.Mock).mock.invocationCallOrder[0];

    expect(batchCommitCall).toBeLessThan(userDeleteCall);
  });

  it('deletes the main user document when the user has no profile documents', async () => {
    // ARRANGE
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [],
    });

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT
    expect(deleteUserProfilesStorage).toHaveBeenCalledWith(uid);

    expect(collection).toHaveBeenCalledWith(
      {},
      `USERS/${uid}/PROFILES`
    );

    expect(doc).toHaveBeenCalledWith(
      {},
      `USERS/${uid}`
    );

    // Even with zero profile documents,
    // the main user document must still be deleted.
    expect(deleteDoc).toHaveBeenCalledWith(mockUserDocRef);

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('does not start Firestore deletion when storage cleanup fails', async () => {
    // ARRANGE
    (deleteUserProfilesStorage as jest.Mock).mockRejectedValue(
      new Error('Storage cleanup failed')
    );

    // ACT + ASSERT
    await expect(
      deleteUserAccountData(uid)
    ).rejects.toThrow('Storage cleanup failed');

    // Firestore cleanup must never start.
    expect(getDocs).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('does not delete the user document when reading profiles fails', async () => {
    // ARRANGE
    (getDocs as jest.Mock).mockRejectedValue(
      new Error('Firestore read failed')
    );

    // ACT + ASSERT
    await expect(
      deleteUserAccountData(uid)
    ).rejects.toThrow('Firestore read failed');

    expect(deleteUserProfilesStorage).toHaveBeenCalledWith(uid);

    expect(writeBatch).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('does not delete the user document when a profile batch fails', async () => {
    // ARRANGE
    const profileDocs = [
      { ref: { id: 'profile-1' } },
    ];

    (getDocs as jest.Mock).mockResolvedValue({
      docs: profileDocs,
    });

    const mockBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockRejectedValue(
        new Error('Batch commit failed')
      ),
    };

    (writeBatch as jest.Mock).mockReturnValue(mockBatch);

    // ACT + ASSERT
    await expect(
      deleteUserAccountData(uid)
    ).rejects.toThrow('Batch commit failed');

    // If the profile cleanup fails,
    // the main user document must not be deleted.
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});