# BE043 — Missing-product review: policy, API and reviewer runbook

This workflow stores untrusted reports in a private server-side SQLite database.
It has no PRODUCTS writer or Firestore data access. Acceptance means eligible for
staging, not approved for publication. Staging reuses DB021's existing barcode
format rule and `pre_seeding_validation.validate_record` required-field rules;
it does not change either validator or introduce a checksum requirement.

## Integration and deployment prerequisites

BE042 is absent from this checkout. Its trusted ingestion handler must call
`Store.ingest(submission_id, verified_uid, product)` after its own authentication,
rate limiting and input controls. Preserve BE042's stable opaque submission ID
and use the UID from verified credentials, never from the request body. Call the
adapter durably before acknowledging ingestion, or use a durable outbox and retry.
Identical retries are idempotent; changed ownership or content returns a conflict.
The adapter accepts barcode/productName/brand only, strips outer barcode whitespace,
preserves leading zeros, and bounds the input to 16 KiB.
Product names and brands must be strings or null; nested metadata is rejected.
Submission IDs must use 1–128 ASCII letters, digits, underscores or hyphens so they
can be addressed safely by the status route.
It exposes no submission creation endpoint and does not replace BE042. No end-to-end BE042 integration is
claimed until that dependency is available.

The backend security owner must provision the **boolean** Firebase custom claim
`missing_product_reviewer: true` through trusted administration. No caller can set
this claim through this workflow. Firebase ID tokens are verified with revocation
checking; expired, revoked and invalid tokens fail closed. No identity headers or
local placeholder registration identities are accepted. Coordinate claim ownership,
revocation response and service-account configuration before deploying. Tests use
an injected verifier; live Firebase verification requires the deployment project.

From the repository root, install `requirements.txt` and configure:

```text
MISSING_REPORT_DB=/private/service-data/missing-reports/review.db
MISSING_REPORT_CURSOR_SECRET=<persistent randomly generated secret, at least 32 bytes>
GOOGLE_APPLICATION_CREDENTIALS=<deployment credential path, outside source control>
```

Mount `database.missing_reports.api:create_app()` in the deployment's WSGI server
behind HTTPS. This is a separate Python service; the Express placeholder server
does not mount it. Route only the documented paths to it. Set reverse-proxy request
timeouts, body/header size limits and per-user request limits. Keep database files,
journals, backups and exports outside web roots and client storage in a mode-0700
directory; new database files are created mode 0600. Use a single local durable
filesystem shared by the service processes, not separate per-instance databases
or an NFS mount. Never sync these tables to Firestore: the repository's current
development Firestore rules are permissive. Do not set Firebase emulator environment
variables in production. Rotate the cursor secret to invalidate outstanding cursors.

## Transition policy

| Current state | Permitted next states |
| --- | --- |
| PENDING | IN_REVIEW, DUPLICATE |
| IN_REVIEW | PENDING, ACCEPTED, REJECTED, DUPLICATE |
| ACCEPTED | None (terminal) |
| REJECTED | None (terminal) |
| DUPLICATE | None (terminal) |

There are no implicit reopen, delete, product-edit or audit-edit operations.
Return IN_REVIEW to PENDING to release an abandoned review. Rejection requires one
of `INSUFFICIENT_INFORMATION`, `INVALID_PRODUCT`, `ABUSE`. Duplicate decisions
require `SAME_BARCODE` and a canonical report ID. Other transitions reject reason
codes and canonical IDs. Free-text notes are not collected.

New reports with an existing normalized barcode are immediately linked as
DUPLICATE in the ingestion transaction, including reports against terminal canonical
items. The oldest canonical item wins deterministically. These system creation events
are audited as `system:BE042`; every reviewer transition records the verified reviewer
UID. Manual duplicate decisions support legacy reports imported before aggregation:
the target must be a different canonical item with the same barcode. Chains, cycles
and linking a source that already has children are rejected. Such legacy groups
require a separately reviewed migration, not unrestricted reviewer editing.

The queue contains canonical items only. `report_count` counts distinct submitting
UIDs across the canonical item and its linked reports, so repeated reports by one
user do not inflate priority. Order is count descending, creation time ascending,
then opaque ID ascending. Older items win ties. Reporter identities are never returned.

## API

All routes require `Authorization: Bearer <Firebase ID token>`. Responses use
`application/json` and `Cache-Control: no-store`.

* `GET /api/missing-products/{id}/status`: owner only. Example:
  `{"id":"report-1","status":"PENDING"}`. Missing and non-owned IDs both return
  404. The response never contains product data, timestamps, counts, canonical IDs,
  reasons, notes, reviewer identities or other reporters. DUPLICATE reports expose
  their own status, not the target or its status. There is no user list endpoint.
* `GET /internal/missing-products`: reviewer only. Filters: `status`,
  `normalized_barcode`, `created_from`, `created_to`, `limit`, `cursor`.
  Dates are inclusive UTC Unix microseconds, range 0–253402300799999999. Bounds
  must be ordered. Limit defaults to 50, range 1–100. Unknown/repeated parameters
  fail with 400. The result is `{"items":[...],"next_cursor":null}`; items contain
  id, barcode, product, status, version, created and report_count. Status DUPLICATE
  yields an empty queue because linked reports are not independent work items.
* `POST /internal/missing-products/{id}/status`: reviewer only; JSON body example:
  `{"status":"ACCEPTED","version":1}`. Duplicate example:
  `{"status":"DUPLICATE","version":0,"reason":"SAME_BARCODE","canonical":"report-1"}`.
  Success returns id/status/new version. Unknown fields are rejected; max body 4 KiB.

Pagination uses signed keyset cursors bound to all filters and page size. Reuse
the same filters on subsequent requests. A store revision binds each traversal:
any intervening ingestion or transition returns 409 `QUEUE_CHANGED`. Restart from
page one. This deliberate restart policy prevents silent skipping/repeating due to
changing report counts or statuses; it does not promise a long-lived snapshot under
continuous writes. Empty and final pages have a null cursor.

Errors are `{"error":"CODE"}`: 401 UNAUTHENTICATED, 403 REVIEWER_REQUIRED,
404 NOT_FOUND, 400 invalid input/reason/cursor, 409 INVALID_TRANSITION or
VERSION_CONFLICT, 413 oversized body, 415 wrong content type, 503 STORE_UNAVAILABLE.
Read the latest queue version before deciding. Never blindly retry a conflicting
decision: another reviewer may already have completed it. All changes run inside
`BEGIN IMMEDIATE`; the state, incremented version and audit event commit together.

## Accepted-submission handoff

Set `MISSING_REPORT_REVIEWER_TOKEN` securely to a current reviewer Firebase token.
Do not put tokens in command arguments, repository files or logs. Run from the root:

```bash
umask 077
python3 -m database.missing_reports --stage report-1 report-2 > /private/staging/batch.json
python3 -m database.missing_reports --batch BATCH_UUID > /private/staging/recovered.json
```

At most 100 unique IDs per call. Every ID must be ACCEPTED and canonical. The entire
batch fails without inserts if any record is incomplete, malformed, duplicated or
already staged. Barcode validation and existing required-field validation run before
the immutable batch commits. Missing productName is rejected even though the existing
validator can suggest a fallback: this command never exports that fallback. Only the
allowlisted product fields reach output. A unique staged barcode prevents duplicate
handoff across batches as well as within a batch.

The output includes `schema`, `trusted:false`, `batch_id`, and records containing
`submission_id`, `version`, `product`. See [sanitized example](missing-product-staging.example.json).
Records are ordered by submission ID in both the initial export and batch recovery.
Submission IDs are opaque provenance references, not reporter identities. Internal
staging metadata records the reviewer and timestamp but does not export them.

Coordinate this versioned envelope with the database pipeline team before consumption.
The team should record the batch/submission/version in their intake ledger, extract
the product payload into their **untrusted** input area, run normal cleaning,
enrichment and catalogue validation, and obtain normal approval before seeding.
No automatic invocation of the pipeline or publication is included. Do not feed
this envelope directly to seed scripts. Incomplete accepted items remain blocked;
correction requires a separately authorized intake process, not editing terminal reports.

## Recovery, audit and retention

If a response is lost, read the current report/version before retrying a decision.
If staging commits but stdout/file delivery fails, recover with `--batch`; do not
restage or delete its ledger row. If the batch ID was lost, an authorized operator
can read `SELECT report,batch FROM staging WHERE report=?` from the private database.
The recovery command returns the committed payload without modifying the batch.
Retry 503 with bounded backoff; inspect storage capacity and lock holders. A crashed
transaction rolls back through SQLite recovery. Back up consistently using SQLite's
backup API; restore reports, audit, revision and staging together. Reconcile restored
batch IDs with the pipeline intake ledger before resuming handoffs.

Audit rows record old/new state, timestamp, verified actor, version, reason and
canonical link. UPDATE/DELETE triggers prohibit modifications through ordinary SQL
and there are no reviewer audit mutation routes. Successful transitions and creation
events each have one unique report/version entry. An administrator with filesystem
access can replace SQLite or remove triggers: restrict that access and retain encrypted,
access-controlled backups or immutable audit snapshots for stronger tamper evidence.
Investigations should correlate report versions, audit sequences and staging provenance,
not copy reporter identities into tickets or exports.

Proposed operational retention, subject to the service's approved retention policy:
review abandoned PENDING items after 90 days; return stale IN_REVIEW items to PENDING
after 14 days using an authorized, audited transition. Retain rejected/duplicate
payloads for 90 days after decision, and accepted staging provenance until pipeline
receipt plus its audit retention period. Do not expire canonical records while linked
reports still depend on them. Schedule a separately privileged, reviewed archival/
pseudonymization job for payload and owner data; reviewers have no deletion capability.
Keep the minimum audit metadata for the approved audit period (proposed one year),
then rotate an entire archived store under documented administrative retention controls.
Retention is guidance, not an unreviewed destructive cron job in this change.

## Completion evidence

Run `python3 -m unittest test.test_missing_report_workflow -v` from the root.
The suite checks the full 5×5 transition matrix, owner isolation, reviewer authorization,
strict reasons, identity sanitization, duplicate linking, bounded deterministic pages,
cursor invalidation, empty queues, concurrent decisions, immutable audits/staging,
atomic validation failures and sanitized batch recovery. The concurrency test requires
exactly one winner and one VERSION_CONFLICT with no extra audit event.

Local validation: **16 workflow tests passed** on 2026-09-14. Additional regression
cases cover nested metadata rejection, route-safe IDs, cursor tampering and ingestion
invalidation, multi-record recovery ordering, audit route isolation and atomic export
failures for missing, wrongly typed, whitespace-only and mismatched product fields.

BE042 wiring, live Firebase claim verification and deployment routing remain integration
prerequisites. Security-owner and pipeline-team coordination have not been performed
by sending external messages. A PR must include these limitations and the test result.
