import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { fdb } from '@/config/firebaseConfig';
import { deleteUserProfilesStorage } from '@/services/storage/uploadProfileAvatar';

const profilesCol = (uid: string) => collection(fdb, `USERS/${uid}/PROFILES`);
const userDoc = (uid: string) => doc(fdb, `USERS/${uid}`);

export async function deleteUserAccountData(uid: string): Promise<void> {
  // Storage cleanup first while auth is still valid.
  await deleteUserProfilesStorage(uid);

  const snap = await getDocs(profilesCol(uid));
  let batch = writeBatch(fdb);
  let count = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    count += 1;
    if (count >= 450) {
      await batch.commit();
      batch = writeBatch(fdb);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  await deleteDoc(userDoc(uid));
}
