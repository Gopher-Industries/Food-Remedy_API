# DB061 – Verify Final Dataset Record Counts

## Result

Record counts were independently counted directly from the real v1.1 release
files — not read from DB060's or DB062's reports — and cross-checked against
`validation_manifest.json` and DB069/DB070's own ledgers and reports. DB060 and
DB062's existing evidence was used only as comparison material, never as the
source of truth for a count.

The real v1.1 lineage is **not** the `products_5k_enriched.json` →
`products_enriched.json` chain verified in DB062 — that chain is v1.0's
pipeline. Per `validation_manifest.json`'s own `source` field, v1.1 is built
from the DB069 candidate. Tracing that real chain end to end:

**61,373 raw records (6 source files) → DB069 selection (5,000 included /
56,373 excluded) → DB069 candidate (5,000) → DB070 cleaning/enrichment (5,000)
→ DB070 validation (5,000 valid, 0 invalid) → final v1.1 release (5,000).**

Every stage reconciles exactly, with zero unaccounted records anywhere in the
chain. Every comparison below is implemented as an executable Python `assert`
in `scripts/db061_verify_release_counts.ipynb` (its `check()` helper), which
raises `AssertionError` on any mismatch — none of these are manual/printed
comparisons a reader has to eyeball.

## What was verified

- **Candidate chain:** `database/Candidates/DB069/generation_record.json`
  (six raw source files) → DB069's `inclusion_ledger.jsonl` /
  `exclusion_ledger.jsonl.gz` → `foodremedy_candidate_db069.json` → DB070
  cleaning/enrichment → DB070's `database/Release/v1.1/db060_validation.json`
  → `database/Release/v1.1/foodremedy_release_v1.1.json`.
- **Manifest:** `database/Release/v1.1/validation_manifest.json` — `source`,
  `workflow.cleaning`, `workflow.enrichment`, `validation.identity`, and
  `dataset` fields.
- **Methodology:** counted directly from each raw file (no trusting a prior
  report's stated number without re-counting), then asserted equal to the
  matching manifest/ledger/report figure.

## Counts across the real v1.1 workflow

| Stage | Source | Count |
| --- | --- | ---: |
| Raw source pool (6 files) | `database/Candidates/DB069/generation_record.json` → `source_files` | 61,373 |
| DB069 excluded | `database/Candidates/DB069/exclusion_ledger.jsonl.gz` (counted directly) | 56,373 |
| DB069 included / candidate | `foodremedy_candidate_db069.json` + `inclusion_ledger.jsonl` (counted directly) | 5,000 |
| DB070 cleaned + enriched output | `validation_manifest.json` → `workflow.cleaning` / `workflow.enrichment` | 5,000 |
| DB070 validation | `database/Release/v1.1/db060_validation.json` (`total_records` / `valid_records`) | 5,000 valid, 0 invalid |
| Final release | `database/Release/v1.1/foodremedy_release_v1.1.json` (counted directly) | 5,000 |
| Unique barcodes | final release file / `validation.identity` | 5,000 (0 duplicates) |

**Reconciliation check:** 5,000 included + 56,373 excluded = **61,373**, an
exact match to the raw source pool total. No records are unaccounted for at
the candidate-selection stage.

## Cross-check against `validation_manifest.json`

- `source.candidate_sha256` matches DB069's candidate hash (`ffc2d26e...`).
- `workflow.cleaning`: input_records 5,000 → output_records 5,000,
  excluded_records 0. **This is DB070's cleaning stage acting on the
  already-selected 5,000-record DB069 candidate** — see the note below before
  comparing it to DB069's own ledgers.
- `workflow.enrichment`: processed 5,000, failures 0 across all enrichment
  modules.
- `validation.identity`: record_count 5,000, valid_unique_barcodes 5,000,
  candidate_identity_and_order_preserved: true.
- `dataset.records` (final release file): 5,000.
- `dataset.sha256` matches DB070's stated final hash — see **Hash finding**
  below for the one wrinkle in confirming this.

## Important: two different ledger pairs, not one

This report deliberately keeps two separate reconciliations apart, because
conflating them was the core issue in the first draft of this verification:

1. **DB069's inclusion/exclusion ledgers (5,000 / 56,373)** answer *which
   records, out of the 61,373-record raw pool, were selected as candidates
   for release* — this is quality-based candidate selection, upstream of
   DB070.
2. **The manifest's `workflow.cleaning.excluded_records` (0)** answers
   *whether DB070's cleaning stage, run on the already-selected 5,000-record
   candidate, excluded anything further* — it is a different question, asked
   at a later stage, and the correct answer there is zero because DB069 had
   already done the exclusion.

Both figures are correct. They are not interchangeable, and a report that
quotes one where it means the other misstates the pipeline.

## Ruled out: this is not v1.0's pipeline

`database/seeding/products_5k_enriched.json` → `products_enriched.json`
(verified in DB062's `pipeline_verification.json`: input sha `fd6648f6...`,
output sha `90170dac...`, 5,000 → 5,000, 0 failures) is **v1.0's** pipeline,
which went on to release 4,731 records after 269 exclusions (per the original,
pre-v1.1 `database/Reports/DB060/release_validation.json`). The v1.1
manifest's `source` field never references this chain — it references the
DB069 candidate above. Counting the v1.0 chain and reporting it as v1.1's
record counts, as an earlier draft of this report did, would have been
auditing the wrong release.

## Comparison against the pre-release (Sept 12) DB060 candidate

This compares two different pipelines' output quality, not the same lineage
measured twice — the Sept-12 candidate is v1.0's, v1.1 is DB069/DB070's. It's
included because the improvement is real and relevant context, not because
the two are the same chain:

| | Sept-12 candidate (v1.0) | v1.1 |
| --- | ---: | ---: |
| Invalid records | 269 | 0 |
| Missing ingredient text | 4,627 | 0 |
| Missing/empty allergens | 4,750 | 0 |
| Missing categories | 4,523 | 0 |

## Notes — worth flagging, not defects

- `database_release_validated: true`, but `production_seeded: false` and
  `production_release_approved: false`. The dataset has passed validation but
  has not yet been seeded to production or given final release approval —
  those are separate, later gates and out of this ticket's scope.
- `db060_status: "CHECKS_PASSED_PENDING_APPROVAL"` in the manifest matches
  `release_approved: false` in `db060_validation.json`, for the same reason:
  automated checks passing is not the same as human release sign-off.

## Hash finding — DB068's integrity gate is working correctly

An earlier draft of this report described a raw SHA-256 mismatch on the local
`foodremedy_release_v1.1.json` (`a1635e22...` vs. the manifest's stated
`43b955c6...`) as a false alarm caused by a Windows checkout line-ending
difference. **That framing was wrong.** The root cause is real: Git on Windows
(`core.autocrlf=true`) converts LF line endings to CRLF on checkout, so the
raw bytes on disk genuinely are not the approved artifact's bytes.

Re-hashing with line endings normalised back to LF does produce an exact
match (`43b955c6...`), which confirms the *content* is identical. But that is
a diagnostic step, not grounds to wave off the raw mismatch: **DB068's
integrity gate is correct to reject the raw, as-checked-out file**, because
that file's bytes genuinely differ from what was approved. Treating this as a
false positive would mean treating any Windows checkout as equivalent to the
approved artifact, which it is not until normalised.

The actionable gap is the repository's missing `.gitattributes` enforcing LF
line endings for release JSON files. Until that's added, every Windows
checkout of this file will keep failing raw-hash verification — correctly —
and the fix is the `.gitattributes` entry, not a change to DB068's gate.

## Reproduce

Every count and cross-check above is computed and asserted directly from the
files listed, by `scripts/db061_verify_release_counts.ipynb`. Re-run it top to
bottom from the repo root (or from `scripts/`, which it auto-detects); every
`check()` cell raises `AssertionError` immediately if any figure no longer
matches.
