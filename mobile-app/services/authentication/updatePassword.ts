import {
  getAuth,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

/**
 * Update Password for logged-in user
 * @param currentPassword - The user's current password for reauthentication
 * @param newPassword - The new password to set
 * @returns Promise<void>
 * @throws Error if update fails
 */
export default async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("No user is currently logged in");
  }

  if (!user.email) {
    throw new Error("User email not found");
  }

  try {
    // Reauthenticate user before password change (Firebase security requirement)
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await firebaseUpdatePassword(user, newPassword);
  } catch (error: any) {
    if (error.code === "auth/wrong-password") {
      throw new Error("Current password is incorrect");
    }
    if (error.code === "auth/weak-password") {
      throw new Error("Password is too weak. Please use at least 6 characters");
    }
    if (error.code === "auth/requires-recent-login") {
      throw new Error("Please log out and log back in before changing password");
    }
    throw error;
  }
}
