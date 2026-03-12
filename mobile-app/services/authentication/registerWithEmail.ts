import { createUserWithEmailAndPassword, sendEmailVerification, UserCredential } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import checkUserExists from "./checkUserExists";
import { Status } from "@/types/Status";
import { auth, fdb } from "@/config/firebaseConfig";

/**
 * Register With Email
 * @param firstName 
 * @param lastName 
 * @param email 
 * @param password 
 * @returns Credential
 */
export default async function registerWithEmail(firstName: string, lastName: string, email: string, password: string): Promise<Status> {
  if (!auth) return { success: false, message: 'Authentication Service Not Availible' };

  try {
    const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, email, password);

    const userExists = await checkUserExists(userCredential.user.uid);
    if (!userExists) {
      await createEmailUserInDatabase(userCredential.user.uid, firstName, lastName, email);
      await sendEmailVerification(userCredential.user);
    }

    return { success: true };
  } catch (error: any) {

    switch (error.code) {
      case "auth/weak-password":
        return { success: false, message: "Weak Password. Should be at least 6 characters" };
      case "auth/email-already-in-use":
        return { success: false, message: "This email is already in use." };
      case "auth/invalid-email":
        return { success: false, message: "Invalid Email" };
      default:
        throw error;
    }
  }
}

/**
 * Create a user account within the Realtime Database using Email/Password
 * @param userID User Identification
 * @param displayName Username
 * @param email User Email
 */
async function createEmailUserInDatabase(userID: string, firstName: string, lastName: string, email: string) {
  try {
    await setDoc(doc(fdb, `USERS/${userID}`), {
      uid: userID,
      userName: firstName,
      userName_lowercase: firstName.toLowerCase(),
      firstName: firstName,
      lastName: lastName,
      email: email,
      photoURL: null,
      hasOnboarded: false,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    throw error;
  }
}


