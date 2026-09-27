# Feature flags

A feature flag is a named on/off switch, that decides whether a piece of UI is reachable. It lets unfinished work sit in `main` switched off, instead of being commented out.

## Using one

In a component, use the hook so the screen updates if the flag changes:

```tsx
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

const showCompareTab = useFeatureFlag("recommendationsTab");
```

Anywhere else, call the function directly:

```ts
import { isFeatureEnabled } from "@/config/featureFlags";

if (isFeatureEnabled("loginCaptcha")) { ... }
```

## Adding one

1. Add an entry to `FEATURE_FLAGS` in `config/featureFlags.ts`.
2. Add the matching literal env read to `ENV_VALUES` just below it.
3. Add the variable to the Environment section of `README.md`.

## Flag priority

1. A runtime override from `setFeatureFlagOverride` or `applyRemoteFeatureFlags`.
2. The flag's env variable.
3. `devDefault` under `__DEV__`, `prodDefault` otherwise.

## Turning one on

Locally, add the variable to `mobile-app/.env` and restart with
`npx expo start -c`.

For a build, set it in the EAS build profile in `eas.json` so the same commit
can produce a preview build with a feature on and a production build with it off.

### Recommendations release gate

`recommendationsTab` remains off by default in development and production. Turn
it on only after the authenticated `/api/recommendations/substitutions` route is
deployed, its server rollout is enabled for the test account, and these device
checks pass:

1. Scan products from at least two unrelated categories and confirm every result
   stays category relevant.
2. Change the active profile and rapidly scan another barcode; no response from
   the old barcode/profile/account may remain visible.
3. Confirm loading, no-eligible-result, incomplete-data, offline, timeout and
   server-failure states do not show static or cached alternatives.
4. Open an alternative and confirm the product screen loads its barcode.

For rollback, set `EXPO_PUBLIC_FEATURE_RECOMMENDATIONS_TAB=false` in the next
build and set the server `SUBSTITUTIONS_ROLLOUT=disabled`. Product scanning and
the product detail screen continue to work without alternatives.
