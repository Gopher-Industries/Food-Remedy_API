// useOnboarding Hook
// Manages onboarding state using AsyncStorage

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'foodremedy.has_completed_onboarding';

// Shared (module-level) cache + pub/sub so multiple hook instances stay in sync.
let cachedHasCompletedOnboarding: boolean | null = null;
const subscribers = new Set<(value: boolean | null) => void>();

function publish(value: boolean | null) {
  cachedHasCompletedOnboarding = value;
  for (const subscriber of subscribers) subscriber(value);
}

async function readOnboardingStatusFromStorage(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === 'true';
}

export function useOnboarding() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(
    cachedHasCompletedOnboarding
  );
  const [loading, setLoading] = useState(cachedHasCompletedOnboarding === null);

  useEffect(() => {
    let isMounted = true;

    const handleUpdate = (value: boolean | null) => {
      if (!isMounted) return;
      setHasCompletedOnboarding(value);
    };

    subscribers.add(handleUpdate);

    // If we don't have a cached value yet, fetch it once.
    if (cachedHasCompletedOnboarding === null) {
      (async () => {
        try {
          const status = await readOnboardingStatusFromStorage();
          publish(status);
        } catch (error) {
          console.error('Error checking onboarding status:', error);
          publish(false);
        } finally {
          if (isMounted) setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
      subscribers.delete(handleUpdate);
    };
  }, []);

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      publish(true);
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };

  const resetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_KEY);
      publish(false);
    } catch (error) {
      console.error('Error resetting onboarding:', error);
    }
  };

  return {
    hasCompletedOnboarding,
    loading,
    completeOnboarding,
    resetOnboarding,
  };
}
