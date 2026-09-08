import { doc, getDoc } from "firebase/firestore";
import { fdb } from "../../config/firebaseConfig";
import { getRequestId, safeLog } from "../backend/safeErrors";

export interface SyncUser {
  id: string;
  name?: string;
  email?: string;
  updatedAt: number; // REQUIRED
}

export const fetchUserFromFirebase = async (userId: string) => {
  const requestId = getRequestId();
  try {
    const ref = doc(fdb, "users", userId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) return null;

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  } catch (error) {
    safeLog("error", "user_sync.cloud_fetch_failed", { requestId, error });
    return null;
  }
};
