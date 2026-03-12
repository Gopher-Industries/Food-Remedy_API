import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { auth } from '@/config/firebaseConfig';

export function useAuthUserId() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        setUid(user.uid);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        setUid(cred.user?.uid ?? null);
      } catch (e) {
        console.warn('Anonymous sign-in failed:', e);
        setUid(null);
      }
    });
    return () => unsub();
  }, []);

  return uid;
}
