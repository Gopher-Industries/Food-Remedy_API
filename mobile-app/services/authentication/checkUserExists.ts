import { doc, getDoc } from 'firebase/firestore';
import { fdb } from '@/config/firebaseConfig';

/**
 * Check User Exists
 * @param uid  user ID
 * @returns 
 */
export default async function checkUserExists(uid: string): Promise<boolean> {

  try {
    const snapshot = await getDoc(doc(fdb, `USERS/${uid}`));
    return snapshot.exists()
  } catch (error: any) {
    throw error;
  }
}