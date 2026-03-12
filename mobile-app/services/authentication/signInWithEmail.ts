import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/config/firebaseConfig';
import { Status } from '@/types/Status';

/**
 * Sign in a user with email and password using Firebase Client SDK
 * @param email 
 * @param password 
 * @returns 
 */
export default async function signInWithEmail(email: string, password: string): Promise<Status> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // if (!userCredential.user.emailVerified) {
    //   return { success: false, message: 'Please verify your email before logging in.' }
    // }

    return { success: true };
  } catch (error: any) {

    if (error.code === 'auth/invalid-email') {
      return { success: false, message: 'Invalid Email' };
    } else if (error.code === 'auth/wrong-password') {
      return { success: false, message: 'Incorrect Password' };
    } else if (error.code === 'auth/user-not-found') {
      return { success: false, message: 'No account with that email was found' };
    } else if (error.code === 'auth/invalid-credential') {
      // Firebase returns this when the supplied credential is malformed or invalid.
      // For email/password sign-in, this usually indicates incorrect email or password.
      return { success: false, message: 'Invalid credentials. Check your email or password.' };
    } else {
      console.error('Authentication error:', error);
      return { success: false, message: 'An unexpected error occurred. Please try again later.' };
    }
  }
}
