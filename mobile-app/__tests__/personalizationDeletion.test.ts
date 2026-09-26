jest.mock('@/config/firebaseConfig', () => ({ fdb: {}, auth: { currentUser: { uid: 'owner' } } }));
jest.mock('@/config/sqlConfig', () => ({ initialiseSQLiteDatabase: jest.fn().mockResolvedValue({}) }));
jest.mock('@/services/sqlDatabase/profiles.dao', () => ({ deleteProfile: jest.fn(), clearProfilesForUser: jest.fn() }));
jest.mock('@/services/storage/uploadProfileAvatar', () => ({
  deleteProfileAvatar: jest.fn(), deleteUserProfilesStorage: jest.fn(),
}));
jest.mock('@/services/database/user/personalization', () => ({ deleteCloudProfilePersonalization: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})), doc: jest.fn(() => ({})),
  deleteDoc: jest.fn(), getDocs: jest.fn(),
  writeBatch: jest.fn(() => ({ delete: jest.fn(), commit: jest.fn() })),
}));

import { deleteUserProfile } from '@/services/database/user/profiles';
import { deleteUserAccountData } from '@/services/database/user/deleteUserAccount';
import { deleteCloudProfilePersonalization } from '@/services/database/user/personalization';
import { deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { deleteProfile, clearProfilesForUser } from '@/services/sqlDatabase/profiles.dao';

describe('BE059 profile and account deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteCloudProfilePersonalization as jest.Mock).mockResolvedValue(undefined);
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });
  });

  it('deletes preference and intent children before the cloud profile, then cascades local rows', async () => {
    await deleteUserProfile('owner', 'child');
    expect(deleteCloudProfilePersonalization).toHaveBeenCalledWith('owner', 'child');
    expect((deleteCloudProfilePersonalization as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((deleteDoc as jest.Mock).mock.invocationCallOrder[0]);
    expect(deleteProfile).toHaveBeenCalledWith({}, 'owner', 'child');
  });

  it('cleans every profile before deleting the account and local household', async () => {
    const commit = jest.fn().mockResolvedValue(undefined);
    (writeBatch as jest.Mock).mockReturnValue({ delete: jest.fn(), commit });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [{ id: 'self', ref: {} }, { id: 'child', ref: {} }] });
    await deleteUserAccountData('owner');
    expect(deleteCloudProfilePersonalization).toHaveBeenNthCalledWith(1, 'owner', 'self');
    expect(deleteCloudProfilePersonalization).toHaveBeenNthCalledWith(2, 'owner', 'child');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(clearProfilesForUser).toHaveBeenCalledWith({}, 'owner');
  });
});
