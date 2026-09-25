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
