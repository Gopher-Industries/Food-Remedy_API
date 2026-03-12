import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";

export type UserProfileName = {
  firstName?: string;
  lastName?: string;
  userName?: string;
};

export default async function getUserProfileName(uid: string): Promise<UserProfileName | null> {
  const userDocRef = doc(fdb, `USERS/${uid}`);
  const userDoc = await getDoc(userDocRef);
  if (!userDoc.exists()) return null;
  const data = userDoc.data() as any;
  return {
    firstName: data?.firstName ?? "",
    lastName: data?.lastName ?? "",
    userName: data?.userName ?? "",
  };
}
