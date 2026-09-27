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
| hCaptcha secret | Server-side production secret | Check in the server deployment with `npm run validate:server-captcha-config`; never supply it to an EAS client build |
| Captcha verification endpoint | Deployed server verifier | Confirm against the deployed backend; the static build check cannot prove it exists |

## Secret Handling

Production secrets must not be committed to source control.

The hCaptcha secret key must only be supplied to the server runtime. The public hCaptcha site key may be exposed to the client, but it must still contain the correct production value. Do not put `HCAPTCHA_SECRET_KEY` in an EAS client build environment.

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

On the server deployment, validate the secret separately without printing it:

```bash
npm run validate:server-captcha-config
```

The validator checks that:

- required production environment variables are present
- the API URL is not a localhost or development URL
- hCaptcha is enabled for production
- the public hCaptcha site key is not a placeholder
- the production EAS build profile exists
- production auto-increment is enabled
- the expected Firebase project and storage bucket are configured

The client validation runs during a **production** EAS build through:

```json
"eas-build-post-install": "npm run validate:release-config"
```

The hook uses `EAS_BUILD_PROFILE` to skip development and preview builds. It does not require the server secret. Firebase project and bucket checks read the current client configuration source; the configuration fingerprint covers the checked values. These static checks do not verify a deployed API route, Firebase project access, or Android/iOS signing credentials.

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
- [ ] Provision `HCAPTCHA_SECRET_KEY` only in the server environment and run its separate check there
- [ ] Verify the deployed CAPTCHA endpoint and backend API health
- [ ] Confirm EAS signing credentials with the release owner
- [ ] Confirm no production secrets are committed to the repository
- [ ] Run `npm run validate:release-config`
- [ ] Confirm release configuration validation passes
- [ ] Run the CAPTCHA route regression tests
- [ ] Confirm all relevant tests pass

## Failure Behaviour

If a required client production value is missing, uses a local/development value, contains a placeholder, or hCaptcha is disabled, production client validation fails with a clear error message. The server secret check fails independently when its value is missing or a placeholder.

This prevents a production build from being released with incomplete or unsafe configuration.
