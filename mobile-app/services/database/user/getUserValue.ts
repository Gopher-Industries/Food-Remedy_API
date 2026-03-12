import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";

/**
 * 
 * @param uid User ID
 * @param key key-pair key
 * @returns 
 */
export default async function getUserValue(uid: string, key: string): Promise<any> {
  try {
    const userDocRef = doc(fdb, `USERS/${uid}`);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData[key];
    } else {
      throw new Error("User document does not exist");
    }
  } catch (error) {
    throw error;
  }
}