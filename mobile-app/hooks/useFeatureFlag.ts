import { useSyncExternalStore } from "react";

import {
    FeatureFlagName,
    isFeatureEnabled,
    subscribeToFeatureFlags,
} from "@/config/featureFlags";

// Read a feature flag inside a component and re-renders the component when flag changes.
//   const showCompareTab = useFeatureFlag("recommendationsTab");
export function useFeatureFlag(name: FeatureFlagName): boolean {
    return useSyncExternalStore(
        subscribeToFeatureFlags,
        () => isFeatureEnabled(name),
        () => isFeatureEnabled(name),
    );
}