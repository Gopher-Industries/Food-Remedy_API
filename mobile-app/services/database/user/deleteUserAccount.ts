import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { fdb } from '@/config/firebaseConfig';
import { deleteUserProfilesStorage } from '@/services/storage/uploadProfileAvatar';
import { deleteCloudProfilePersonalization } from './personalization';
import { deleteAllShoppingListsFirestore } from './shoppingLists';
import { deleteLegacyCartData } from './legacyCart';
import { initialiseSQLiteDatabase } from '@/config/sqlConfig';
import { clearProfilesForUser } from '@/services/sqlDatabase/profiles.dao';
import { clearFavourites } from '@/services/sqlDatabase/favourites.dao';
import { clearHistory, getAuthenticatedHistoryOwnerScope } from '@/services/sqlDatabase/history.dao';
import { clearShoppingListsForUser } from '@/services/sqlDatabase/shoppingList.dao';

const profilesCol = (uid: string) => collection(fdb, `USERS/${uid}/PROFILES`);
const userDoc = (uid: string) => doc(fdb, `USERS/${uid}`);

/**
 * Remove every account-scoped resource for uid across Firestore, Storage and the
 * local SQLite cache. Must complete before Firebase Auth deletion: a thrown error
 * here must stop the caller from proceeding to deleteUser().
 * Each step is independently safe to retry (missing/already-deleted resources are no-ops).
 */
export async function deleteUserAccountData(uid: string): Promise<void> {
  // Storage cleanup first while auth is still valid.
  await deleteUserProfilesStorage(uid);

  const snap = await getDocs(profilesCol(uid));
  let batch = writeBatch(fdb);
  let count = 0;

  for (const d of snap.docs) {
    await deleteCloudProfilePersonalization(uid, d.id);
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

  // Subcollections outside PROFILES that Firestore will not cascade-delete on their own.
  await deleteAllShoppingListsFirestore(uid);
  await deleteLegacyCartData(uid);

  await deleteDoc(userDoc(uid));

  const db = await initialiseSQLiteDatabase();
  await clearFavourites(db, uid);
  await clearHistory(db, getAuthenticatedHistoryOwnerScope(uid));
  await clearShoppingListsForUser(db, uid);
  // Cascades profile_preferences, saved_shopping_intents and recommendation_event_outbox
  // via their ON DELETE CASCADE foreign keys (foreign_keys=ON, see sqlConfig.ts).
  await clearProfilesForUser(db, uid);
}
