import { doc, getDoc, updateDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import { Status } from "@/types/Status";

/**
 * Update User Value
 * @param uid User ID
 * @param key key-pair key
 * @param value The value to update
 * @returns Status of the operation
 */
export default async function updateUserValue(uid: string, key: string, value: any): Promise<Status> {
  try {
    const userDocRef = doc(fdb, `USERS/${uid}`);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return { success: false, message: 'No User Found' };
    }

    // Update the document with the new value
    await updateDoc(userDocRef, {
      [key]: value
    });

    return { success: true };
  } catch (error) {
    throw error;
  }
}
