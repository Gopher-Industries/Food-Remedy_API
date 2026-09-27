// Legacy pre-USERS cart collection cleanup (still served by app/api/shopping-cart-api).

import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { fdb } from '@/config/firebaseConfig';

const legacyCartCol = (uid: string) => collection(fdb, `users/${uid}/cart`);

/** Delete every legacy cart item document owned by uid. Safe to retry if the cart is already empty. */
export async function deleteLegacyCartData(uid: string): Promise<void> {
  const snap = await getDocs(legacyCartCol(uid));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(fdb);
    for (const d of docs.slice(i, i + 450)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

export default { deleteLegacyCartData };
