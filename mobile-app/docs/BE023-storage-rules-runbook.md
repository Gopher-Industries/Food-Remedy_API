# BE023 Firebase Storage Rules Runbook

## Policy

Profile avatars are stored at:

```text
USERS/{uid}/PROFILES/{profileId}/avatar.{jpg,png,webp}
```

Only the authenticated Firebase user whose UID matches `{uid}` can read, upload, overwrite, or delete avatars at that path. Unrelated Storage paths are denied by default.

Allowed avatar MIME types:

```text
image/jpeg
image/png
image/webp
```

Maximum avatar upload size:

```text
5 MiB
```

## Emulator Validation

Install dependencies first if needed:

```bash
npm install
```

Run the focused Storage rules test:

```bash
npm run test:storage-rules
```

Run the wider Jest suite:

```bash
npm test
```

Expected evidence:

- Owner upload/read/overwrite/delete succeeds.
- Cross-user upload/read/delete fails.
- Unauthenticated upload/read/delete fails.
- Unsupported MIME type fails.
- Oversized upload fails.

## Android Release-Candidate Smoke Test

1. Open the Android release-candidate build.
2. Sign in as a test user.
3. Open the profile/member photo edit flow.
4. Upload a valid `.jpg`, `.png`, or `.webp` avatar.
5. Confirm the avatar appears in profile screens.
6. Replace the avatar and confirm the updated image appears.
7. Remove/delete the avatar if the current screen supports removal.
8. Restart the app and sign in again.
9. Confirm the expected avatar state is still shown.
10. Confirm unrelated Firebase-backed features still behave normally.

Use test accounts and test data only.

## Deployment Notes

Do not deploy Storage rules until the Pull Request has been reviewed and approved.

Before deployment, confirm the Firebase project target:

```bash
firebase use
```

Review the rule diff:

```bash
git diff -- storage.rules firebase.json
```

After approval, deploy only Storage rules:

```bash
firebase deploy --only storage
```

After deployment, repeat the Android smoke test against the approved Firebase project and capture the result in the ticket or Pull Request.
