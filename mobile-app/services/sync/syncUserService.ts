export interface SyncUser {
  id: string;
  name?: string;
  email?: string;
  updatedAt: number; // REQUIRED
}

import { doc, getDoc } from "firebase/firestore";
import { fdb } from "../../config/firebaseConfig";

export const fetchUserFromFirebase = async (userId: string) => {
  try {
    const ref = doc(fdb, "users", userId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) return null;

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  } catch (error) {
    console.error("Firebase fetch error:", error);
    return null;
  }
};