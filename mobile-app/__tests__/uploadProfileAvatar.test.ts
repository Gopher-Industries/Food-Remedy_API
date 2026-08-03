jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  uploadAsync: jest.fn(),
  FileSystemUploadType: {
    BINARY_CONTENT: 'BINARY_CONTENT',
  },
}));

jest.mock('firebase/storage', () => ({
  deleteObject: jest.fn(),
  getDownloadURL: jest.fn(),
  listAll: jest.fn(),
  ref: jest.fn((storage: any, path: string) => ({ storage, path })),
  uploadBytes: jest.fn(),
  uploadString: jest.fn(),
}));

jest.mock('../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  storage: { app: { options: { storageBucket: 'test-bucket.appspot.com', projectId: 'test-project' } } },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'download-token-123'),
}));

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  deleteObject,
  getDownloadURL,
  listAll,
  uploadBytes,
  uploadString,
} from 'firebase/storage';
import {
  deleteProfileAvatar,
  deleteProfileAvatarByUrl,
  deleteUserProfilesStorage,
  getProfileAvatarDownloadUrl,
  isRemoteUri,
  uploadProfileAvatar,
} from '../services/storage/uploadProfileAvatar';

const mockedPlatform = Platform as { OS: string };
const mockedFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const mockedDeleteObject = deleteObject as jest.MockedFunction<typeof deleteObject>;
const mockedGetDownloadURL = getDownloadURL as jest.MockedFunction<typeof getDownloadURL>;
const mockedListAll = listAll as jest.MockedFunction<typeof listAll>;
const mockedUploadBytes = uploadBytes as jest.MockedFunction<typeof uploadBytes>;
const mockedUploadString = uploadString as jest.MockedFunction<typeof uploadString>;
const { auth: mockedAuth, storage: mockedStorage } = jest.requireMock('../config/firebaseConfig') as {
  auth: { currentUser: any };
  storage: { app: { options: { storageBucket: string; projectId: string } } };
};

describe('uploadProfileAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPlatform.OS = 'web';
    mockedAuth.currentUser = null;
    mockedStorage.app.options.storageBucket = 'test-bucket.appspot.com';
    mockedStorage.app.options.projectId = 'test-project';
  });

  it('falls back from base64 to blob upload on web and returns the download URL', async () => {
    mockedFileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('base64 failed'));
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue({ type: 'image/png' }),
    } as any);
    mockedUploadBytes.mockResolvedValueOnce({} as any);
    mockedGetDownloadURL.mockResolvedValueOnce('https://download.example/avatar.png');

    const result = await uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.png');

    expect(mockedFileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///avatar.png', { encoding: 'base64' });
    expect(mockedUploadString).not.toHaveBeenCalled();
    expect(mockedUploadBytes).toHaveBeenCalledTimes(1);
    expect(result).toBe('https://download.example/avatar.png');
  });

  it('propagates the blob upload failure after the base64 fallback fails', async () => {
    const blobError = new Error('blob failed');
    mockedFileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('base64 failed'));
    (globalThis as any).fetch = jest.fn().mockRejectedValue(blobError);

    await expect(uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.png')).rejects.toThrow('blob failed');
    expect(mockedGetDownloadURL).not.toHaveBeenCalled();
  });
});

describe('native uploadProfileAvatarViaRest behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPlatform.OS = 'android';
    mockedAuth.currentUser = { uid: 'auth-user', getIdToken: jest.fn().mockResolvedValue('token-123') };
    mockedStorage.app.options.storageBucket = 'test-bucket.appspot.com';
    mockedStorage.app.options.projectId = 'test-project';
    mockedFileSystem.uploadAsync.mockResolvedValue({ status: 200, body: JSON.stringify({ downloadTokens: 'token-a,token-b' }) } as any);
  });

  it('rejects when the storage bucket is missing', async () => {
    mockedStorage.app.options.storageBucket = '';

    await expect(uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.jpg')).rejects.toThrow('Missing Firebase storageBucket');
  });

  it('rejects when auth is missing', async () => {
    mockedAuth.currentUser = null;

    await expect(uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.jpg')).rejects.toThrow('Not authenticated');
  });

  it('uploads through REST and uses the first download token', async () => {
    const result = await uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.jpg');

    expect(mockedFileSystem.uploadAsync).toHaveBeenCalledTimes(1);
    expect(result).toContain('token-a');
    expect(result).toContain('avatar.jpg');
  });

  it('throws a billing-specific error for REST status 402', async () => {
    mockedFileSystem.uploadAsync.mockResolvedValueOnce({ status: 402, body: 'billing blocked' } as any);

    await expect(uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.jpg')).rejects.toThrow('Firebase Storage billing blocked (402)');
  });

  it('throws for other REST failures', async () => {
    mockedFileSystem.uploadAsync.mockResolvedValueOnce({ status: 500, body: 'server down' } as any);

    await expect(uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.jpg')).rejects.toThrow('REST upload failed (status 500)');
  });

  it('falls back to a media URL when metadata token creation fails', async () => {
    mockedFileSystem.uploadAsync.mockResolvedValueOnce({ status: 200, body: '{}' } as any);
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('metadata patch failed'));

    const result = await uploadProfileAvatar('user-1', 'profile-1', 'file:///avatar.jpg');

    expect(result).toBe('https://firebasestorage.googleapis.com/v0/b/test-bucket.appspot.com/o/USERS%2Fuser-1%2FPROFILES%2Fprofile-1%2Favatar.jpg?alt=media');
  });
});

describe('download lookup and delete helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPlatform.OS = 'web';
  });

  it('tries the known extensions until it finds a download URL', async () => {
    mockedGetDownloadURL
      .mockRejectedValueOnce({ code: 'storage/object-not-found' })
      .mockRejectedValueOnce({ code: 'storage/object-not-found' })
      .mockResolvedValueOnce('https://download.example/avatar.webp');

    await expect(getProfileAvatarDownloadUrl('user-1', 'profile-1')).resolves.toBe('https://download.example/avatar.webp');
    expect(mockedGetDownloadURL).toHaveBeenCalledTimes(3);
  });

  it('returns null when all avatar extension lookups are missing', async () => {
    mockedGetDownloadURL.mockRejectedValue({ code: 'storage/object-not-found' });

    await expect(getProfileAvatarDownloadUrl('user-1', 'profile-1')).resolves.toBeNull();
  });

  it('propagates download lookup errors that are not object-not-found', async () => {
    mockedGetDownloadURL.mockRejectedValueOnce({ code: 'storage/unauthorized' });

    await expect(getProfileAvatarDownloadUrl('user-1', 'profile-1')).rejects.toMatchObject({ code: 'storage/unauthorized' });
  });

  it('does nothing for non-remote avatar values', async () => {
    await expect(deleteProfileAvatarByUrl('file:///avatar.jpg')).resolves.toBeUndefined();
    await expect(deleteProfileAvatarByUrl('')).resolves.toBeUndefined();
    await expect(deleteProfileAvatarByUrl(null)).resolves.toBeUndefined();
    expect(mockedDeleteObject).not.toHaveBeenCalled();
  });

  it('deletes remote avatar URLs', async () => {
    await deleteProfileAvatarByUrl('https://firebasestorage.googleapis.com/v0/b/test-bucket.appspot.com/o/avatar.jpg?alt=media');

    expect(mockedDeleteObject).toHaveBeenCalledTimes(1);
  });

  it('tries common extensions until delete succeeds', async () => {
    mockedDeleteObject
      .mockRejectedValueOnce({ code: 'storage/object-not-found' })
      .mockRejectedValueOnce({ code: 'storage/object-not-found' })
      .mockResolvedValueOnce(undefined);

    await expect(deleteProfileAvatar('user-1', 'profile-1')).resolves.toBeUndefined();
    expect(mockedDeleteObject).toHaveBeenCalledTimes(3);
  });

  it('silently completes when every delete lookup is missing', async () => {
    mockedDeleteObject.mockRejectedValue({ code: 'storage/object-not-found' });

    await expect(deleteProfileAvatar('user-1', 'profile-1')).resolves.toBeUndefined();
  });

  it('propagates delete errors that are not object-not-found', async () => {
    mockedDeleteObject.mockRejectedValueOnce({ code: 'storage/unauthorized' });

    await expect(deleteProfileAvatar('user-1', 'profile-1')).rejects.toMatchObject({ code: 'storage/unauthorized' });
  });

  it('deletes all storage objects under the profile folder recursively', async () => {
    mockedListAll
      .mockResolvedValueOnce({
        items: [{ id: 'item-1' }],
        prefixes: [{ id: 'prefix-1' }],
      } as any)
      .mockResolvedValueOnce({
        items: [{ id: 'nested-item-1' }],
        prefixes: [],
      } as any);
    mockedDeleteObject.mockResolvedValue(undefined);

    await expect(deleteUserProfilesStorage('user-1')).resolves.toBeUndefined();
    expect(mockedListAll).toHaveBeenCalledTimes(2);
    expect(mockedDeleteObject).toHaveBeenCalledTimes(2);
  });

  it('propagates recursive delete failures', async () => {
    mockedListAll.mockRejectedValueOnce(new Error('list failed'));

    await expect(deleteUserProfilesStorage('user-1')).rejects.toThrow('list failed');
  });

  it('treats http and https URLs as remote', () => {
    expect(isRemoteUri('http://example.com/avatar.jpg')).toBe(true);
    expect(isRemoteUri('https://example.com/avatar.jpg')).toBe(true);
    expect(isRemoteUri('file:///avatar.jpg')).toBe(false);
  });
});
