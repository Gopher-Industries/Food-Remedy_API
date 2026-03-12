import { getAuth, sendPasswordResetEmail } from "firebase/auth";

/**
 * Send Password Reset
 * @param email 
 */
export default async function sendPasswordReset(email: string) {
  try {
    const auth = getAuth();
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw error;
  }
}