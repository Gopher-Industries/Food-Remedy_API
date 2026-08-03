/*
PURPOSE:
This test file verifies that deleteUserAccountData removes a user's data
in the correct order.

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

  beforeEach(() => {
    jest.clearAllMocks();

    // Fake Firestore references.
    (collection as jest.Mock).mockReturnValue({ path: 'profiles' });
    (doc as jest.Mock).mockReturnValue({ path: `USERS/${uid}` });

    // Storage cleanup succeeds by default.
    (deleteUserProfilesStorage as jest.Mock).mockResolvedValue(undefined);

    // Final user document deletion succeeds by default.
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
  });


  it('deletes profile storage before starting Firestore cleanup', async () => {
    // ARRANGE:
    // No profile documents are stored for this user.
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [],
    });

    // ACT
    await deleteUserAccountData(uid);

    // ASSERT:
    // Both functions should have been called.
    expect(deleteUserProfilesStorage).toHaveBeenCalledWith(uid);
    expect(getDocs).toHaveBeenCalledTimes(1);

    // Storage cleanup must happen before Firestore getDocs().
    const storageCall =
      (deleteUserProfilesStorage as jest.Mock).mock.invocationCallOrder[0];

    const firestoreCall =
      (getDocs as jest.Mock).mock.invocationCallOrder[0];

    expect(storageCall).toBeLessThan(firestoreCall);
  });


  it('deletes profile documents using a Firestore batch', async () => {
    // ARRANGE:
    // Two fake Firestore profile documents.
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

    // ASSERT:
    // Both profile documents should be added to the batch.
    expect(mockBatch.delete).toHaveBeenCalledTimes(2);
    expect(mockBatch.delete).toHaveBeenCalledWith(profileDocs[0].ref);
    expect(mockBatch.delete).toHaveBeenCalledWith(profileDocs[1].ref);

    // The batch should then be committed.
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });


  it('creates another batch when more than 450 profile documents exist', async () => {
    // ARRANGE:
    // The implementation commits a batch after 450 documents.
    // Using 451 profiles verifies that a second batch is created.
    const profileDocs = Array.from({ length: 451 }, (_, index) => ({
      ref: { id: `profile-${index + 1}` },
    }));

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

    // ASSERT:
    // First batch should contain the first 450 profiles.
    expect(firstBatch.delete).toHaveBeenCalledTimes(450);
    expect(firstBatch.commit).toHaveBeenCalledTimes(1);

    // The remaining profile should be placed in a second batch.
    expect(secondBatch.delete).toHaveBeenCalledTimes(1);
    expect(secondBatch.commit).toHaveBeenCalledTimes(1);

    expect(writeBatch).toHaveBeenCalledTimes(2);
  });


  it('deletes the main user document after profile cleanup is complete', async () => {
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

    // ASSERT:
    // Final user document should be deleted.
    expect(deleteDoc).toHaveBeenCalledTimes(1);

    // The batch containing profile deletions must finish first.
    const batchCommitCall =
      mockBatch.commit.mock.invocationCallOrder[0];

    const userDeleteCall =
      (deleteDoc as jest.Mock).mock.invocationCallOrder[0];

    expect(batchCommitCall).toBeLessThan(userDeleteCall);
  });


  it('does not start Firestore deletion when storage cleanup fails', async () => {
    // ARRANGE:
    // Simulate Firebase Storage cleanup failing.
    (deleteUserProfilesStorage as jest.Mock).mockRejectedValue(
      new Error('Storage cleanup failed')
    );

    // ACT + ASSERT
    await expect(deleteUserAccountData(uid)).rejects.toThrow(
      'Storage cleanup failed'
    );

    // Firestore cleanup must never start.
    expect(getDocs).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });


  it('does not delete the user document when reading profiles fails', async () => {
    // ARRANGE:
    // Storage succeeds, but Firestore profile retrieval fails.
    (getDocs as jest.Mock).mockRejectedValue(
      new Error('Firestore read failed')
    );

    // ACT + ASSERT
    await expect(deleteUserAccountData(uid)).rejects.toThrow(
      'Firestore read failed'
    );

    // Storage happened first.
    expect(deleteUserProfilesStorage).toHaveBeenCalledWith(uid);

    // But the final user document should not be deleted.
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
    await expect(deleteUserAccountData(uid)).rejects.toThrow(
      'Batch commit failed'
    );

    // If profile deletion fails, the main user document must remain.
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});