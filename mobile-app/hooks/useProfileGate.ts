import { useMemo } from 'react';
import { useSQLiteDatabase } from '@/components/providers/SQLiteDatabaseProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useProfile } from '@/components/providers/ProfileProvider';

type Gate = 'loading' | 'needs-onboarding' | 'needs-demographics' | 'ready';

export function useProfileGate() {
  const { isDbReady } = useSQLiteDatabase();
  const { user } = useAuth();
  const { profiles, isHydrated } = useProfile();

  const gate: Gate = useMemo(() => {
    if (!user?.uid || !isDbReady || !isHydrated) return 'loading';
    if (profiles.length === 0) return 'needs-onboarding';
    const hasDemographics = profiles.some(p => p.profileId === 'demographics');
    if(!hasDemographics) return 'needs-demographics';
    return 'ready';
  }, [user?.uid, isDbReady, isHydrated, profiles]);

  return {
    gate,
    profiles,
    userId: user?.uid,
  };
}
