# DB061 – Verify Final Dataset Record Counts

## Result

Record counts were independently verified directly against the real dataset
files at every release stage — input, enriched, validated, and final output —
for the v1.1 candidate. All four stages reconcile at exactly **5,000 records**,
with **zero excluded records, zero enrichment failures, and zero duplicate
barcodes**. No unexplained record loss was found anywhere in the release chain.

This ticket cross-checks and confirms the counts already established by DB060
and DB062; it does not repeat their validation or pipeline work.

## Counts across the workflow

| Stage | Source | Count |
| --- | --- | ---: |
| Input | `database/seeding/products_5k_enriched.json` (path/count confirmed via DB062 `pipeline_verification.json`) | 5,000 |
| Enriched | `database/seeding/products_enriched.json` (counted directly) | 5,000 |
| Validated | `database/Release/v1.1/db060_validation.json` (`total_records` / `valid_records`) | 5,000 valid, 0 invalid |
| Included / Excluded | `database/Release/v1.1/inclusion_ledger.jsonl` / `exclusion_ledger.jsonl` (counted directly) | 5,000 included, 0 excluded |
| Final output | `database/Release/v1.1/foodremedy_release_v1.1.json` (counted directly) | 5,000 |
| Unique barcodes | `validation_manifest.json` → `workflow.cleaning.unique_valid_barcodes` / `validation.identity.valid_unique_barcodes` | 5,000 (0 duplicates) |

Each count above was produced two ways: read directly from the raw file, and
cross-checked against the number the existing DB060/DB062 evidence or the
release manifest already states for that stage. All of them agree.

## Cross-check against `validation_manifest.json`

The v1.1 release manifest independently confirms the same numbers end-to-end:

- `workflow.cleaning`: input_records 5,000 → output_records 5,000, excluded_records 0
- `workflow.enrichment`: processed 5,000, failures 0 across all 5 modules
- `workflow.inclusion_count` / `exclusion_count`: 5,000 / 0
- `validation.identity`: record_count 5,000, valid_unique_barcodes 5,000, candidate_identity_and_order_preserved: true
- `dataset.records` (final release file): 5,000

## Notes — worth flagging, not defects

- `database_release_validated: true`, but `production_seeded: false` and
  `production_release_approved: false`. The dataset has passed validation but
  has not yet been seeded to production or given final release approval —
  those are separate, later gates and out of this ticket's scope.
- `db060_status: "CHECKS_PASSED_PENDING_APPROVAL"` in the manifest matches
  `release_approved: false` in `db060_validation.json`, for the same reason:
  automated checks passing is not the same as human release sign-off.
- Category tagging shows `PASS_WITH_REPORTED_UNMAPPED_VALUES` (1,629
  tagged-but-unmapped records). This is a category-quality note, not a
  record-count issue, and is out of scope for this ticket.

## Comparison against the pre-release (Sept 12) candidate

Every quality issue present in the pre-release candidate validated in the
original DB060 report is resolved in v1.1:

| | Sept-12 candidate | v1.1 |
| --- | ---: | ---: |
| Invalid records | 269 | 0 |
| Missing ingredient text | 4,627 | 0 |
| Missing/empty allergens | 4,750 | 0 |
| Missing categories | 4,523 | 0 |

## Differences found

One difference was found during verification, and it is fully explained — it
does not represent record loss.

**Raw file hash did not initially match the manifest.** The local
`foodremedy_release_v1.1.json` (SHA-256 `a1635e22...`) did not match the
manifest's stated hash (`43b955c6...`) on first check. Root cause: Git on
Windows (`core.autocrlf=true`) converts LF line endings to CRLF on checkout,
which changes the file's raw bytes without changing its content. Re-hashing
the file with line endings normalised back to LF produces `43b955c6...` — an
exact match. **This confirms no data loss or corruption**; it is purely a
Windows checkout artifact.

This is worth flagging to the team: anyone verifying this file's integrity by
raw-byte hash on a Windows checkout will hit the same false mismatch, which is
directly relevant to DB068's integrity gate.

Record counts themselves — input, enriched, validated, included/excluded, and
final output — all reconcile at 5,000 with no unexplained loss.

## Reproduce

Counts were computed directly from the files listed above using
`scripts/db061_verify_release_counts.ipynb`. Re-run it top to bottom from the
repo root (or from `scripts/`, which it auto-detects) to regenerate every
number in this document.
