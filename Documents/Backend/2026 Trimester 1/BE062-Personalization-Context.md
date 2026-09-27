# BE062 — Authoritative personalization context

`resolvePersonalizationContext` receives a verified UID and an owned profile ID.
Its Firestore repository reads profile, explicit preferences, optional saved
intent and bounded recent events only below
`USERS/{verifiedUid}/PROFILES/{profileId}`. It rejects inactive, missing and
foreign profiles with one generic unavailable error. No caller-supplied safety
or preference object is accepted. This is an internal server module, not a
public API, and does not change candidate order.

The v1 result has four separate fields: `explicit`, `observed`, `inferred`
(currently empty), and `intention`. It contains no UID, profile ID, barcode,
allergen name, dietary restriction, or event history. A user without records
gets valid empty arrays and a null intention. The serializer sorts preference
arrays to give stable fixture and cache-key bytes. Saved-intent text is bounded
by BE059's schema and included only when its owned ID is requested.

## Evidence policy v1

| Action | Direction | Base strength |
| --- | --- | ---: |
| shown, dismissed | none | 0 |
| opened | positive weak signal | 0.25 |
| added_to_list | positive | 1 |
| thumbs_up | positive explicit outcome | 3 |
| thumbs_down | negative explicit outcome | 3 |
| purchased | positive user-reported outcome, not receipt-verified | 1 |

The repository reads at most 40 events, uses only the last 30 days, and reads
semantic evidence for at most 20 distinct products. Freshness decreases
linearly to a floor of 0.25. Attributes below 0.7 provenance confidence,
unknown attributes, and `not_applicable` add no signal. Aggregate strength is
capped at 12 per dimension/value/sentiment. Observations contrary to an
explicit declaration for the same value are excluded. Child events are omitted
unless the profile grants evidence consent. This policy describes preference
evidence, never safety eligibility; BE067 must separately calibrate ranking
weights before enabling semantic ranking.

The unit suite covers empty contexts, foreign-path denial, child consent,
freshness, impression neutrality, preference precedence, and redaction. The
Firestore emulator suite creates two accounts and independent Self/child
records, then verifies the resolved contexts and foreign denial. No real
household data or external model call is used.

On 2026-09-26, the full mobile Jest suite passed 353 tests with 10 skipped,
TypeScript passed, and the Firestore emulator passed four repository/context
tests. Context resolution remains an internal server module and has no public
route or Jev call in this ticket.

```sh
npm --prefix mobile-app test -- --runInBand --silent personalizationContext.test.ts
npx firebase emulators:exec --only firestore --project demo-food-remedy-be037 \
  'npm --prefix mobile-app test -- --runInBand --silent firestoreProductSubstitutionRepository.test.ts'
```
