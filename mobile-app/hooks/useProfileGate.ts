import { useMemo } from 'react';
import { useSQLiteDatabase } from '@/components/providers/SQLiteDatabaseProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useProfile } from '@/components/providers/ProfileProvider';

type Gate = 'loading' | 'needs-onboarding' | 'ready';

export function useProfileGate() {
  const { isDbReady } = useSQLiteDatabase();
  const { user } = useAuth();
  const { profiles, isHydrated } = useProfile();

  const gate: Gate = useMemo(() => {
    if (!user?.uid || !isDbReady || !isHydrated) return 'loading';
    return profiles.length === 0 ? 'needs-onboarding' : 'ready';
  }, [user?.uid, isDbReady, isHydrated, profiles.length]);

  return {
    gate,
    profiles,
    userId: user?.uid,
  };
}
