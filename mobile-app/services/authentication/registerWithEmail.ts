import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  User,
  UserCredential,
} from "firebase/auth";
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
export default async function registerWithEmail(
  firstName: string,
  lastName: string,
  email: string,
  password: string
): Promise<Status> {
  if (!auth) {
    return {
      success: false,
      message: "Authentication Service Not Availible",
    };
  }

  try {
    const userCredential: UserCredential =
      await createUserWithEmailAndPassword(auth, email, password);

    return await provisionEmailUser(
      userCredential.user,
      firstName,
      lastName,
      email
    );
  } catch (error: any) {
    switch (error.code) {
      case "auth/weak-password":
        return {
          success: false,
          message: "Weak Password. Should be at least 6 characters",
        };

      case "auth/email-already-in-use":
        return await recoverExistingEmailUser(
          firstName,
          lastName,
          email,
          password
        );

      case "auth/invalid-email":
        return {
          success: false,
          message: "Invalid Email",
        };

      default:
        console.error("Registration failed:", error);
        return {
          success: false,
          message: "Unable to complete registration. Please try again later.",
        };
    }
  }
}

/**
 * Provision the Firestore user document and verification email.
 */
async function provisionEmailUser(
  user: User,
  firstName: string,
  lastName: string,
  email: string
): Promise<Status> {
  try {
    const userExists = await checkUserExists(user.uid);

    if (!userExists) {
      await createEmailUserInDatabase(
        user.uid,
        firstName,
        lastName,
        email
      );
    }
  } catch (error) {
    console.error("Registration Firestore provisioning failed:", error);

    return {
      success: false,
      message:
        "Your account was created, but setup could not be completed. Please try registering again.",
    };
  }

  if (!user.emailVerified) {
    try {
      await sendEmailVerification(user);
    } catch (error) {
      console.error("Registration verification email failed:", error);

      return {
        success: false,
        message:
          "Your account was created, but the verification email could not be sent. Please try again.",
      };
    }
  }

  return { success: true };
}

/**
 * Recover an Auth account created by an earlier partial registration.
 */
async function recoverExistingEmailUser(
  firstName: string,
  lastName: string,
  email: string,
  password: string
): Promise<Status> {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const userExists = await checkUserExists(userCredential.user.uid);

    if (userExists) {
      return {
        success: false,
        message: "This email is already in use.",
      };
    }

    try {
      await createEmailUserInDatabase(
        userCredential.user.uid,
        firstName,
        lastName,
        email
      );
    } catch (error) {
      console.error("Registration Firestore recovery failed:", error);

      return {
        success: false,
        message:
          "Your account exists, but setup could not be completed. Please try again.",
      };
    }

    if (!userCredential.user.emailVerified) {
      try {
        await sendEmailVerification(userCredential.user);
      } catch (error) {
        console.error("Registration verification email failed:", error);

        return {
          success: false,
          message:
            "Your account was created, but the verification email could not be sent. Please try again.",
        };
      }
    }

    return { success: true };

    return await provisionEmailUser(
      userCredential.user,
      firstName,
      lastName,
      email
    );
  } catch (error) {
    console.error("Registration recovery failed:", error);

    return {
      success: false,
      message: "This email is already in use.",
    };
  }
}

/**
 * Create a user account within the Realtime Database using Email/Password
 * @param userID User Identification
 * @param displayName Username
 * @param email User Email
 */
async function createEmailUserInDatabase(
  userID: string,
  firstName: string,
  lastName: string,
  email: string
) {
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
}


