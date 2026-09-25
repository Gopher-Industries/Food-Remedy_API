# BE029 Captcha Verification Decision

## Decision

Retain hCaptcha and require server-side token verification before the login flow continues.

## Context

The current login screen opens `CaptchaModal`, receives an hCaptcha token, stores it in local component state, and then continues to Firebase Authentication through the client SDK. The existing client-side captcha callback alone is not a trusted production security boundary because the token is not verified by a backend before authentication continues.

## Chosen Approach

The client obtains an hCaptcha token and sends it to the app API route `POST /verify-captcha`. The API route reads the server-only `HCAPTCHA_SECRET_KEY`, sends the token to hCaptcha `siteverify`, and returns only a safe verification result. Login continues only after the route returns `verified: true`.

The hCaptcha public site key remains client-side through `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`. The hCaptcha secret remains server-side only through `HCAPTCHA_SECRET_KEY`.

## Security Behaviour

Missing, invalid, expired, or replayed tokens fail verification and do not continue login. hCaptcha reports token reuse with provider error codes such as `invalid-or-already-seen-response`, so replay rejection is delegated to the provider contract.

Verification timeout, provider outage, missing server secret, and malformed provider failures fail closed. The user receives a generic captcha failure/unavailable message and authentication does not continue.

Logs record only safe categories such as `missing_token`, `provider_timeout`, or `provider_unavailable`. Captcha tokens, secrets, provider request bodies, and raw provider responses must not be logged.

## Alternatives Considered

Removing captcha was not selected because the repository did not show another approved production abuse-control gate replacing it for login. Firebase Authentication remains the authentication provider, but it does not verify this hCaptcha token by itself in the current flow.
