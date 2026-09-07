import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fs from 'fs';

const PROJECT_ID = 'food-remedy-storage-rules-test';
const OWNER_UID = 'user-a';
const ATTACKER_UID = 'user-b';
const PROFILE_ID = 'profile-1';
const AVATAR_PATH = `USERS/${OWNER_UID}/PROFILES/${PROFILE_ID}/avatar.jpg`;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? process.env.STORAGE_EMULATOR_HOST;
const describeStorageRules = storageEmulatorHost ? describe : describe.skip;

describeStorageRules('Firebase Storage avatar ownership rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: {
        rules: fs.readFileSync('storage.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
  });

  function ownerAvatarRef(path = AVATAR_PATH) {
    return testEnv.authenticatedContext(OWNER_UID).storage().ref(path);
  }

  function attackerAvatarRef(path = AVATAR_PATH) {
    return testEnv.authenticatedContext(ATTACKER_UID).storage().ref(path);
  }

  function unauthenticatedAvatarRef(path = AVATAR_PATH) {
    return testEnv.unauthenticatedContext().storage().ref(path);
  }

  function uploadAvatar(ref: ReturnType<typeof ownerAvatarRef>, data: string, contentType: string) {
    return ref.putString(data, 'raw', { contentType }) as unknown as Promise<unknown>;
  }

  async function seedOwnerAvatar() {
    await assertSucceeds(uploadAvatar(ownerAvatarRef(), 'valid avatar data', 'image/jpeg'));
  }

  it('allows the authenticated owner to upload, read, overwrite, and delete their avatar', async () => {
    await assertSucceeds(uploadAvatar(ownerAvatarRef(), 'valid avatar data', 'image/jpeg'));

    await assertSucceeds(ownerAvatarRef().getDownloadURL());

    await assertSucceeds(uploadAvatar(ownerAvatarRef(), 'updated avatar data', 'image/jpeg'));

    await assertSucceeds(ownerAvatarRef().delete());
  });

  it('denies another authenticated user access to the owner avatar path', async () => {
    await seedOwnerAvatar();

    await assertFails(uploadAvatar(attackerAvatarRef(), 'attacker upload', 'image/jpeg'));
    await assertFails(attackerAvatarRef().getDownloadURL());
    await assertFails(attackerAvatarRef().delete());
  });

  it('denies unauthenticated avatar access', async () => {
    await seedOwnerAvatar();

    await assertFails(uploadAvatar(unauthenticatedAvatarRef(), 'anonymous upload', 'image/jpeg'));
    await assertFails(unauthenticatedAvatarRef().getDownloadURL());
    await assertFails(unauthenticatedAvatarRef().delete());
  });

  it('denies unsupported avatar MIME types', async () => {
    await assertFails(uploadAvatar(ownerAvatarRef(), 'not an image', 'text/plain'));
  });

  it('denies oversized avatar uploads', async () => {
    const oversizedAvatar = 'x'.repeat(MAX_AVATAR_BYTES + 1);

    await assertFails(uploadAvatar(ownerAvatarRef(), oversizedAvatar, 'image/jpeg'));
  });

  it('denies unsupported avatar file names and unrelated storage paths', async () => {
    await assertFails(uploadAvatar(ownerAvatarRef(`USERS/${OWNER_UID}/PROFILES/${PROFILE_ID}/notes.txt`), 'notes', 'text/plain'));

    await assertFails(uploadAvatar(ownerAvatarRef(`PUBLIC/${OWNER_UID}/avatar.jpg`), 'avatar', 'image/jpeg'));
  });
});
