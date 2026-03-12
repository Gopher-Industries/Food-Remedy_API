import { auth } from '@/config/firebaseConfig';
import { signOut } from 'firebase/auth';

/**
 * Sign Out User
 */
export default async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error: any) {
    throw error;
  }
};