# BE059 — Explicit preference and saved-intent persistence

## Storage change

The prior local database had `user_version=5` on this substitution stack (the
current `main` history migration uses version 6). Version 7 adds two tables and
leaves `profiles`, favourites, history and shopping lists untouched:

| Table | Key | Columns | Delete behavior |
| --- | --- | --- | --- |
| `profile_preferences` | `(user_id, profile_id)` | v1 schema version, bounded validated JSON payload, `updated_at` | Composite foreign key cascades with owned profile |
| `saved_shopping_intents` | `(user_id, profile_id, intent_id)` | Bounded text, optional occasion/convenience, explicit provenance, timestamps and optional tombstone | Composite foreign key cascades with owned profile |

`idx_profiles_owner_profile`, `idx_preferences_owner_updated` and
`idx_intents_owner_updated` support scoped reads. The migration uses
`CREATE ... IF NOT EXISTS`, works from v5 or v6, and advances to v7 once.
`PRAGMA foreign_keys=ON` is set when the Expo database opens. The local DAO
requires an active owner/profile pair before writes and validates BE058 shapes.

Firestore stores the explicit record at
`USERS/{uid}/PROFILES/{profileId}/PERSONALIZATION/preferences` and saved intents
at `.../SAVED_INTENTS/{intentId}`. The account owner may read either beneath an
existing profile, but direct preference writes are denied. The authenticated
`PUT /api/personalization/preferences` endpoint validates the complete 32-entry
BE058 shape and writes under the verified token UID using Firebase Admin. This
avoids Firestore rules' 1,000-expression ceiling for validating every array
element. Saved-intent client writes have scalar schema checks in Firestore rules.
The route must be deployed and its public base URL set as
`EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL`; credentials remain server-side.

## Sync and deletion

The existing sign-in profile sync invokes personalization sync after safety
profiles exist. Each active household profile is reconciled independently.
`updatedAt` selects the latest version; equal times favor a deletion tombstone,
then sorted-key canonical JSON for a stable tie. No sync write changes the
record's timestamp. An offline failure retains local records for retry on the
next profile sync. A deleted intent retains only its ID/timestamps and the
`(deleted)` placeholder, so its raw text cannot return after reconciliation.

Profile and account deletion remove Firestore preference and intent children
before removing parent documents. Local profile deletion cascades both v7
tables. Firestore rules deny client reads of children without a parent. The
current sync does not provide a background network-reconnect trigger; it runs
with the existing sign-in profile sync and when called explicitly.

## Reproduction and results

```sh
python3 -m unittest -v test.test_personalization_migration
npm --prefix mobile-app test -- --runInBand --silent personalizationPreferenceApi.test.ts personalizationPersistence.test.ts productSubstitutionApi.test.ts substitutionEligibility.test.ts profileSync.test.ts
npx firebase emulators:exec --only firestore --project demo-food-remedy-personalization 'node mobile-app/scripts/testPersonalizationRules.cjs'
```

On 2026-09-26: 2 SQLite migration/cascade tests passed for both v5 and v6;
22 targeted Jest tests passed across the new persistence, API, deletion, and
profile-sync suites. The full mobile Jest run passed 334 tests with 9 skipped.
The emulator passed two-account,
unauthenticated, server-only preference write, saved-intent shape, inactive
profile and missing-parent assertions. The existing Firestore rules regression
suite also passed all 16 checks. The full TypeScript check passed. Safety-profile
rows were byte-for-byte identical before and after the migration fixture, and
deterministic substitution API/eligibility tests passed.

The current Expo configuration uses static web export, which skips API routes.
Preference writes remain queued locally until the Expo API routes are hosted
and `EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL` points to that server. The
Firestore rules intentionally deny direct preference writes from clients.

The Firestore emulator does not enforce production indexes or every production
limit. The rules and index configuration should be deployed together after
normal release review. No production Firestore data or credentials were used in
these tests.
