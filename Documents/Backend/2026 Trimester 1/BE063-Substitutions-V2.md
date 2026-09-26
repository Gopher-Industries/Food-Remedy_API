# BE063 — Authenticated intent-aware substitutions v2

The existing `1.0.0` request and response remain deterministic and keep their
Self-profile behavior and field names. `2.0.0` requires `profileId` and accepts
either a one-off `intention` or an owned `savedIntentId`. Empty or omitted
intention uses the same deterministic ranking as v1. V2 currently also returns
deterministic order when an intention is present; BE065–BE067 add gated
semantic evaluation. One-off text is kept only in the request's in-memory
context and is not written to saved preferences or evidence.

`contracts/recommendation_substitutions_v2.schema.json` and its examples
define the wire format. The server additionally checks GTIN checksum, request
body <=1,024 bytes, intention <=240 Unicode characters and <=512 UTF-8 bytes,
well-formed Unicode and absence of controls. The validator rejects all other
fields, including UID, profile, allergy, preference, score and weight objects.
Both v1 and v2 require a verified Firebase bearer token before repository
reads, use the same 200-candidate/20-result bounds, deadline, cancellation,
and sanitized error path.

The v2 repository reads the safety profile beneath
`USERS/{verifiedUid}/PROFILES/{profileId}`. The context resolver separately
loads bounded, redacted preference and saved-intent data under the same path.
Missing, inactive and foreign profiles return the same `PROFILE_UNAVAILABLE`
envelope. Safety eligibility remains entirely deterministic. V2 gives
`deterministicScore` separately from nullable `semanticScore` and
`semanticConfidence`, with a `rankingMode` of `deterministic` until semantic
ranking is enabled. Typed reason codes are deterministic catalogue facts; no
model text or sensitive restriction values are returned.

Validation commands:

```sh
python3 -m unittest -v test.test_substitution_v2_contract
npm --prefix mobile-app test -- --runInBand --silent productSubstitutionApi.test.ts
npx firebase emulators:exec --only firestore --project demo-food-remedy-be037 \
  'npm --prefix mobile-app test -- --runInBand --silent firestoreProductSubstitutionRepository.test.ts'
```

These cover malformed intent, field tampering, foreign-profile symmetry,
owner/child profile selection, hard safety exclusions, v1 order equivalence,
and the v2 response schema. No TypeSafe call or ranking weight change occurs
in this ticket.
