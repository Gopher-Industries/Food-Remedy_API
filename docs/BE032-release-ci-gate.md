# BE032 release CI gate

`.github/workflows/release-gate.yml` runs on pull requests to `main`, pushes to
`main`, and manual dispatches. It uses locked dependencies (`npm ci`), Node
20.19.0, and Temurin Java 21.0.12+8.0.LTS for the Firebase emulators. The workflow
does not read production credentials: emulator checks run with demo Firebase
project IDs.

| Job | Checks |
| --- | --- |
| Mobile release checks | TypeScript compilation, Expo lint, the mobile/API Jest regression suite, Storage emulator rules, and release configuration/assets |
| Database and Firestore release checks | DB030 integration tests, Firestore emulator rules, and a gate failure-detection probe |

Each command writes a log to a job artifact retained for 14 days, including
when an earlier command fails. A failed command uses `set -o pipefail`, so
logging through `tee` cannot mask a failed release check.

## Green baseline (2026-09-02)

The following completed locally on the BE032 branch:

- `npm --prefix mobile-app run typecheck` — passed.
- `npm --prefix mobile-app run lint` — passed with 0 errors and 90 existing warnings.
- `npm --prefix mobile-app test -- --runInBand` — 19 suites passed, 1 Storage-emulator suite skipped in the non-emulator run; 243 tests passed.
- `npm run test:db030` — all five DB030 integration checks passed.
- `npm run test:firestore-rules` — 16 Firestore emulator authorization tests passed.
- `npm --prefix mobile-app run test:storage-rules` — 6 Storage emulator rules tests passed.
- `npm --prefix mobile-app run test:release-config` — passed.

## Intentional-failure evidence

`npm run test:ci-gate-failure-probe` creates a temporary JavaScript file with
invalid syntax and invokes the same `node --check` failure mechanism a CI
command uses. The probe succeeds only when the intentional syntax error is
rejected; it printed `syntax failures are detected` in the green baseline.
