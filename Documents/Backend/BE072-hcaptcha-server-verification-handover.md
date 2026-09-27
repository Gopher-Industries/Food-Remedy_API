# BE072 — Fail-Closed hCaptcha Verification and Token Redaction

## Original security issue

The login screen previously accepted the token emitted by the hCaptcha WebView as proof of success, logged token-bearing values, and proceeded directly to Firebase Authentication. No trusted server exchanged the token with hCaptcha before login.

## Verification flow

1. The existing native/web hCaptcha component obtains a provider token.
2. The login gate sends only that token to `POST /api/verify-captcha`.
3. The API route reads `HCAPTCHA_SECRET_KEY` on the server and delegates to the bounded verification handler.
4. The handler posts the secret and token to `https://api.hcaptcha.com/siteverify` with a five-second timeout.
5. Only a provider response with `success === true` returns `{ "verified": true }`.
6. Firebase email/password sign-in executes on the client only after that response. Passwords are never sent to this endpoint.

CAPTCHA-disabled development behavior is preserved: the login gate skips verification and uses the existing Firebase client flow.

## Affected paths

- `mobile-app/app/api/verify-captcha+api.ts`
- `mobile-app/server/captchaVerificationHandler.ts`
- `mobile-app/services/security/verifyCaptchaToken.ts`
- `mobile-app/services/authentication/captchaLogin.ts`
- `mobile-app/app/login.tsx`
- `mobile-app/components/security/CaptchaModal.tsx`
- `mobile-app/components/security/CaptchaModal.web.tsx`

## Fail-closed behavior

Verification returns only `{ "verified": false }` for missing/empty/oversized tokens, a missing server secret, rejected or expired tokens, malformed provider responses, provider HTTP failures, timeouts and network errors. Responses use `Cache-Control: no-store` and never include provider details.

## Token redaction

- Removed the login-screen token log.
- Removed logging of the raw native WebView message.
- Replaced the web widget's raw error logging with a fixed message.
- The server handler does not log tokens, secrets, form bodies or provider responses.
- Client failures are converted to a fixed `CaptchaVerificationError` without token data.

## Tests added

- `captchaVerificationApi.test.ts`: success, missing/empty/oversized token, rejected token, malformed provider data, timeout, provider/network failure, missing secret, minimal responses and log redaction.
- `captchaLogin.test.ts`: verification-before-sign-in ordering, blocked sign-in for verification failures and unchanged CAPTCHA-disabled development flow.
- `verifyCaptchaToken.test.ts`: endpoint contract, strict success parsing and client token-log protection.

## Validation results

- `npx tsc --noEmit`: passed.
- Focused BE072 tests: 3 suites, 24 tests passed.
- Full Jest: 55 suites passed, 503 tests passed; 5 environment-dependent suites / 15 tests skipped by existing configuration.
- Changed-file ESLint: passed with no warnings or errors.
- `npm run validate:server-captcha-config` with a non-secret fixture: passed.
- `git diff --check`: passed.

## Residual limitations

- `HCAPTCHA_SECRET_KEY` must be configured in the deployed API environment; the endpoint deliberately fails closed when it is absent.
- This protects the shipped application's login flow. It does not prevent a custom client from calling Firebase Authentication directly; addressing that requires provider/platform abuse controls outside this ticket.
- Provider dashboard hostname settings and production deployment verification remain operational release tasks.

## Tracking

- Ticket: BE072
- Branch: `BE072-hcaptcha-server-verification`
- Pull request: add URL after the branch is published.
