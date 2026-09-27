// Captcha configuration (hCaptcha).
//
// Local web (localhost): hCaptcha often fails to render until "localhost" is added to the
// site key's allowed hostnames in the hCaptcha dashboard. To avoid blocking login during dev,
// captcha defaults OFF when __DEV__ is true, unless you set EXPO_PUBLIC_CAPTCHA_ENABLED=true.
//
// Production builds: captcha defaults ON (set EXPO_PUBLIC_CAPTCHA_ENABLED=false to turn off).
// Set EXPO_PUBLIC_HCAPTCHA_SITE_KEY for your real site key; do not commit secrets.

import { isFeatureEnabled } from "./featureFlags";

/** Prefer env site key; fallback is only for teams that already registered that key + hosts. */
export const HCAPTCHA_SITE_KEY =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY) ||
  "398aa972-4792-4c00-9656-430017ace0f6";

// captcha enabled/disabled based on the featureFlags config
export const CAPTCHA_ENABLED = isFeatureEnabled("loginCaptcha");
