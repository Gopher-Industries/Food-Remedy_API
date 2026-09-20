# Production Release Configuration Checklist

This document defines the required production configuration for Food Remedy releases and the checks that must pass before a production build is considered ready.

## Required Production Configuration

| Configuration | Required production value | Validation |
| --- | --- | --- |
| EAS build profile | `production` | `eas.json` must contain a production build profile |
| Auto increment | Enabled | `eas.json` production `autoIncrement` must be `true` |
| API base URL | Production HTTPS URL | `EXPO_PUBLIC_API_BASE_URL` must be set and must not use localhost or a local development address |
| Firebase project | `foodremedy-deakin` | Production builds must use the production Firebase project |
| Firebase storage bucket | `foodremedy-deakin.firebasestorage.app` | Production builds must use the production storage bucket |
| hCaptcha | Enabled | `EXPO_PUBLIC_HCAPTCHA_ENABLED` must be `true` |
| hCaptcha site key | Production site key | `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` must be set and must not contain a placeholder/test value |
| hCaptcha secret | Server-side production secret | `HCAPTCHA_SECRET_KEY` must be set and must not contain a placeholder/test value |
| Captcha verification endpoint | `/verify-captcha` | Client configuration must use the expected verification endpoint |

## Secret Handling

Production secrets must not be committed to source control.

The hCaptcha secret key must only be supplied through the production build/server environment. The public hCaptcha site key may be exposed to the client, but it must still contain the correct production value.

Do not commit real secret values to:

- `.env` files
- application source files
- configuration files
- test fixtures
- documentation

## Automated Validation

Production configuration can be validated locally with:

```bash
npm run validate:release-config
```

The validator checks that:

- required production environment variables are present
- the API URL is not a localhost or development URL
- hCaptcha is enabled for production
- hCaptcha site and secret keys are not placeholder values
- the production EAS build profile exists
- production auto-increment is enabled
- the expected Firebase project and storage bucket are configured

The validation is also executed during the EAS build process through:

```json
"eas-build-post-install": "npm run validate:release-config"
```

A production build should fail when required release configuration is missing or unsafe.

## Pre-Release Checklist

Before creating a production release:

- [ ] Confirm the production profile exists in `eas.json`
- [ ] Confirm production `autoIncrement` is enabled
- [ ] Set `EXPO_PUBLIC_API_BASE_URL` to the production HTTPS API URL
- [ ] Confirm the API URL does not reference localhost or a development server
- [ ] Confirm Firebase uses the `foodremedy-deakin` production project
- [ ] Confirm Firebase storage uses `foodremedy-deakin.firebasestorage.app`
- [ ] Set `EXPO_PUBLIC_HCAPTCHA_ENABLED=true`
- [ ] Set the production `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`
- [ ] Set the server-side production `HCAPTCHA_SECRET_KEY`
- [ ] Confirm no production secrets are committed to the repository
- [ ] Run `npm run validate:release-config`
- [ ] Confirm release configuration validation passes
- [ ] Run the CAPTCHA route regression tests
- [ ] Confirm all relevant tests pass

## Failure Behaviour

If a required production value is missing, uses a local/development value, contains a placeholder, or hCaptcha is disabled, release configuration validation must fail with a clear error message.

This prevents a production build from being released with incomplete or unsafe configuration.