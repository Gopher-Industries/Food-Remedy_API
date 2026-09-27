# BE043: Add private missing-product review and accepted-report staging

Missing-product reports need an auditable review lifecycle before they can become
catalogue pipeline inputs. This change adds a private SQLite workflow with a
Firebase-authenticated WSGI status API, reviewer queue and versioned decisions.
Owners receive only their own report ID and status. Reports with matching normalized
barcodes aggregate under one queue item, prioritized by distinct report count and age.

Transitions and immutable audit entries commit atomically. Signed keyset pagination
rejects stale traversals when the queue changes. A reviewer-authenticated staging
command validates accepted reports with the existing barcode and pre-seeding rules,
stores immutable recoverable batches, and emits sanitized untrusted JSON. It never
writes PRODUCTS or invokes publication.

Validation: `python3 -m unittest test.test_missing_report_workflow -v` — 16 tests
passed, including all 25 state pairs, authorization and sanitization, concurrent
review/ingestion, audit rollback and immutability, pagination/filter boundaries,
duplicate exports, incomplete/malformed records and batch recovery.
Multi-record exports and recovery have identical deterministic ordering. Ingestion
rejects nested product-field metadata and submission IDs that cannot be safely routed.
The existing DB021 barcode regression suite also passed (11 tests) in an isolated
pytest environment. Workflow tests exercise the real barcode and required-field
validators. No canonical validation rules were changed.

Integration prerequisites: BE042 ingestion code is absent from this checkout. Wire
its trusted handler to the documented idempotent adapter. The Python WSGI service
requires deployment routing; it is not mounted in the placeholder Express server.
The security owner must provision and verify the Firebase reviewer claim, and the
pipeline team must agree on the staging envelope before consuming it. Live Firebase
verification was not exercised by the local injected-verifier tests.
The review workflow is proposed in the BE043 pull request. It remains inactive
until the BE042 ingestion adapter and a server deployment are provided.

See [reviewer runbook and API](missing-product-review.md) and
[sanitized staging sample](missing-product-staging.example.json).
