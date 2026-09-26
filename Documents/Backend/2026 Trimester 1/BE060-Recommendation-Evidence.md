# BE060 — Privacy-bounded recommendation evidence

## Authoritative path

The existing authenticated substitutions handler now optionally issues a
`recommendationSessionId` after deterministic safety and ranking complete. The
version 1 response change is additive. Session creation failure leaves the
same deterministic recommendations available without a session ID. A session
stores the verified owner's profile path, original barcode, exact issued
candidate set, server-derived deterministic scores, ranking mode and model
version. It expires after seven days.

`POST /api/recommendations/events` accepts only the BE058 event input shape
without `receivedAt`. The server verifies the Firebase token, bounded body,
event age, active owned profile, child consent, session, original barcode and
candidate barcode. It creates each event ID once in a Firestore transaction.
Retrying the same ID and payload returns `200 duplicate`; changing the payload
under the same ID returns the same generic `409 EVIDENCE_UNAVAILABLE` response
as a missing or foreign session. No client score, model ID, allergy, dietary
restriction or raw intention field is accepted.

Example request (an actual session ID comes from the substitution response):

```json
{"schemaVersion":"1.0.0","eventId":"event_1","profileId":"self","recommendationSessionId":"session_1","originalBarcode":"12345678","candidateBarcode":"87654321","action":"thumbs_down","rejectionReason":"wrong_texture","occurredAt":"2026-09-26T00:00:00Z"}
```

Stored under `USERS/{verifiedUid}/PROFILES/{profileId}/RECOMMENDATION_EVENTS/{eventId}`:

```json
{"event":{"schemaVersion":"1.0.0","eventId":"event_1","profileId":"self","recommendationSessionId":"session_1","originalBarcode":"12345678","candidateBarcode":"87654321","action":"thumbs_down","rejectionReason":"wrong_texture","occurredAt":"2026-09-26T00:00:00Z","receivedAt":"2026-09-26T00:00:01Z"},"serverMetadata":{"rankingMode":"deterministic","modelVersion":"deterministic-v1","deterministicScore":0.82},"expiresAt":"2026-12-25T00:00:01Z","ttlAt":"Firestore Timestamp"}
```

`ttlAt` is a Firestore Timestamp; the string above is only an illustrative
representation. The `firestore.indexes.json` field overrides enable TTL for
sessions and events when deployed. Firestore TTL deletion is asynchronous;
profile/account deletion explicitly deletes child records first. Owner reads
are allowed for export, but direct client creation or modification is denied.
Child profiles require `recommendationEvidenceConsent=true` on the owned
profile before a session is created or an event is ingested; missing consent
fails with the generic response.

## Offline queue and privacy policy

SQLite version 8 adds `recommendation_event_outbox` with a composite owner and
profile foreign key, bounded payload, event ID, attempt count and next retry
time. The DAO accepts only the validated client event fields. A pending event
survives offline failures and retries under the same ID with capped exponential
backoff. A `200` duplicate or `201` stored response removes it; invalid,
expired or rejected sessions are removed. Profile deletion cascades local
pending events. The existing profile sync drains at most 20 due events per run.

| Field | API / local queue | Firestore owner export | Jev context | Aggregate logs |
| --- | --- | --- | --- | --- |
| UID, profile ID, session ID, event ID, barcodes | Required for authenticated routing and idempotence | Included with retained event where relevant | Omitted | Omitted |
| Raw intention and safety restriction names | Rejected | Omitted | Omitted after safety evaluation | Omitted |
| Action and controlled rejection reason | Retained at most 90 days | Included | Bounded observed summary only, never raw event history | Aggregate counts only |
| Deterministic score and model version | Server-derived from issued session | Included in internal metadata | Not a client label | Aggregate version/outcome only |
| `shown` impression | Retained for exposure accounting | Included | Never negative preference evidence | Aggregate count only |

Thumbs feedback and user-reported purchases can be stronger signals than opens
and list additions, but this endpoint does not verify a purchase. A shown event
alone has zero negative weight. BE062 defines
the exact bounded summarization policy. Child consent revocation requires
stopping ingestion and deleting retained child sessions/events; deletion code
already removes those records with the child profile. A future consent UI must
call the same cleanup when consent is revoked. Owner export should enumerate
retained events under each owned profile and include event provenance and
timestamps; it must not include deleted or expired documents. This ticket
provides the owner-scoped read path and policy, not an export UI.

## Verification

```sh
python3 -m unittest -v test.test_recommendation_event_migration
npm --prefix mobile-app test -- --runInBand --silent recommendationEvidenceRepository.test.ts recommendationEventApi.test.ts recommendationEventSync.test.ts productSubstitutionApi.test.ts personalizationDeletion.test.ts
npx firebase emulators:exec --only firestore --project demo-food-remedy-personalization 'node mobile-app/scripts/testPersonalizationRules.cjs'
```

On 2026-09-26, the migration/cascade test passed; the full mobile Jest suite
passed 344 tests with 9 skipped, TypeScript passed, and 10 contract tests plus
7 subtests passed. The emulator denied foreign and unauthenticated reads, direct event/session
writes, and reads after parent removal. No production data or TypeSafe calls
were used. TTL configuration is committed but has not been deployed. The current
static Expo export skips these API routes, so session issuance and ingestion
remain unavailable until a server deployment is configured. Child consent
revocation cleanup still needs an authoritative update path before activation.
