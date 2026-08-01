import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/config/firebaseConfig';

export function useAuthUserId() {
  const initialUser = auth.currentUser;
  const [uid, setUid] = useState<string | null>(
    initialUser && !initialUser.isAnonymous ? initialUser.uid : null
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      if (user && !user.isAnonymous) {
        setUid(user.uid);
        return;
      }
      setUid(null);
    });
    return () => unsub();
  }, []);

  return uid;
}
