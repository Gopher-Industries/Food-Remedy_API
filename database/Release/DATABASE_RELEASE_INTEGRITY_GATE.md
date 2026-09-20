# Database Release Integrity Gate

## Purpose

This gate answers one release question: **is the approved product dataset able to
travel through enrichment, seeding and storage into the same Firestore data path
that the application reads, without a hidden partial failure?**

It combines four project-level contracts that were previously checked separately
or only by manual inspection:

1. the product collection used by seeders, DB012 and the mobile/API readers;
2. the exact output handed from one enrichment module to the next and into seeding;
3. contiguous, dataset-bound Firestore seeding checkpoints;
4. SQLite upgrade safety for users who already have the older history schema.

The gate produces JSON and Markdown evidence, returns a non-zero exit code when a
release condition is not met, and runs its credential-free profile on relevant
pull requests.

## Verified baseline risks

These were reproduced from the repository before the controls were added.

| Risk | Repository evidence | Reproduction before the change | Control added |
| --- | --- | --- | --- |
| Firestore collection drift | `schema_definition.json`, `seed_engine.py` and seven mobile/API reads used `PRODUCTS`; `seed_firestore.py`, `batch_seeder.py` and DB012 defaulted to `products`. Git history also shows DB026 aligned the main seeder before DB035 reintroduced lowercase. | A seed could complete in a different case-sensitive collection while DB012 passed against that same wrong collection. | Active seeders and DB012 load `schema_definition.json` through `data_contract.py`; the gate scans all direct mobile/API product reads and blocks any disagreement. |
| Enrichment output identity was ignored | `allergens_enrich.run()` can return a normalised absolute output path, while `run_enrich_stage()` advanced with its requested path. `run_pipeline.py` then preferred the configured seed input. | A synthetic module wrote to a redirected path and reported it; the next module attempted the requested path instead of the real artifact. | The stage verifies the reported file exists, passes that file downstream, and the orchestrator gives the actual enrichment output to the seed module. A redirecting-producer failure injection runs in the gate. |
| Seeder could checkpoint past a failed batch | `mark_batch_failure()` did not record the failed index; a later `mark_batch_success()` replaced `last_batch_index` unconditionally. Resume used `last_batch_index + 1`. | Success 0, failure 1, success 2 produced `next_batch_index=3`, skipping failed batch 1. The resume offset also subtracted one batch and could repeat the last completed batch. | Seeding stops after exhausted retries; the checkpoint refuses non-contiguous success, resumes at `next_batch_index * batch_size`, records failed batches and binds progress to the dataset SHA-256, record count, batch size and collection. |
| SQLite upgrade failed before its migration ran | The initial schema block created `idx_hist_owner_last_seen` before inspecting/rebuilding a legacy `product_history` table without `owner_scope`. | Executing the committed initialisation SQL against the legacy table raised `no such column: owner_scope`. | Index creation is deferred to the existing post-migration statement. The gate executes the old-schema upgrade in SQLite, verifies row preservation, the composite primary key and the final index. |

The specific allergen path calculation reported in DB057 is already corrected on
main. This work keeps that fix and tests the wider module-output contract so a
future module cannot recreate the same class of silent handoff error.

## Gate profiles

### Structural profile

The structural profile is deterministic, read-only and requires no cloud
credentials. It checks:

- every active product seeder and DB012 uses the shared Firestore contract;
- every direct product read discovered under the mobile services and API uses the
  contract collection;
- pipeline configuration binds enrichment output to the approved versioned
  release manifest and seed input;
- enabled enrichment modules exist;
- a redirected module output is consumed by the next module;
- a failed middle seed batch remains the resume point;
- a checkpoint cannot be reused for another dataset;
- the legacy SQLite history row survives migration and receives the correct key
  and index.

Run it with:

```bash
python scripts/database_release_gate.py \
  --mode structural \
  --json-output /tmp/database-release-integrity.json \
  --markdown-output /tmp/database-release-integrity.md
```

The same profile and its failure-injection tests run in
`.github/workflows/database-release-integrity.yml`. Both reports are uploaded as
CI artifacts for reviewers.

### Release profile

The release profile adds two release-blocking controls:

- DB060 validation of the exact candidate, including its SHA-256 and failure
  counts;
- read-only Firestore sampling from the contract collection, comparing document
  IDs, barcode fields and product names with records spread across the candidate.

```bash
python scripts/database_release_gate.py \
  --mode release \
  --dataset database/Release/v1.0/foodremedy_release_v1.0.json \
  --with-firestore \
  --json-output /tmp/database-release-integrity.json \
  --markdown-output /tmp/database-release-integrity.md
```

The command is intentionally blocked if `--with-firestore` is omitted. An offline
dataset check cannot prove that deployment reached the collection used by the
app. The workflow exposes the live profile only through a manual action and reads
the service account from the `FIREBASE_SERVICE_ACCOUNT_B64` GitHub secret. The
gate itself only performs document reads.

## Safe seeding and recovery

Checkpoints now use schema version 2. Progress is valid only for the exact tuple:

- candidate SHA-256;
- total record count;
- batch size;
- Firestore collection.

The old committed checkpoint only contained `{"last_batch_index": 10}`. It could
not prove which candidate or batch size it represented, so it has been removed.
Legacy or mismatched progress is rejected with instructions to reset explicitly.

For an intentionally new, reviewed candidate:

```bash
python database/seeding/seed_firestore.py \
  --input database/Release/v1.0/foodremedy_release_v1.0.json \
  --validate \
  --reset-checkpoint
```

Do not reset a checkpoint just to bypass an unexplained mismatch. Confirm the
candidate hash, collection and batch configuration first. After a real batch
failure, rerun without reset; processing resumes at the failed batch. A partial
run no longer rewrites `seeded_products.json` as though the whole candidate had
been deployed.

## Current release status

The structural gate passes after these controls. DB063/DB064 generated and
approved the immutable offline artifact
`database/Release/v1.0/foodremedy_release_v1.0.json`: 4,731 of 4,731 records
pass DB060, with SHA-256
`3e13e4be688c5ff2728857385547d2438052e41699221f34cc001a4939da0b72`.
The 269 unusable identity rows from the enriched 5,000-record candidate are
traceable in `v1.0/exclusions.json`; no barcode or product name was guessed.
Alternative mappings were rebuilt after exclusion and all 39,421 references
resolve within the released catalogue.

The release manifest binds the enriched candidate, pipeline configuration,
versioned artifact and configured seed input by SHA-256. Production has not yet
been seeded or read back. Deployment must run the live release profile against
the v1.0 file, provide the workflow secret and retain the successful artifacts.

## Evidence for review

The focused test suite covers contract drift detection, redirecting enrichment
outputs, missing output files, partial stage rejection, legacy checkpoint refusal,
middle-batch failure and exact resume, candidate blocking, and executable SQLite
migration. Run:

```bash
python -m pytest \
  database/test_database_release_gate.py \
  database/seeding/test_enhanced_seeding.py \
  database/test_db057_allergen_safety.py \
  database/test_db060_release_validation.py \
  database/test_db037_pipeline_error_handling.py -q
```

The before/after demonstrations are measurable:

| Scenario | Before | After |
| --- | --- | --- |
| Reader/writer collection agreement | 3 active database paths used lowercase while application reads used uppercase | all active paths derive from or match `PRODUCTS`; CI scans every direct app/API use |
| Failure at batch index 1 followed by batch 2 | resume index became 3 | non-contiguous advance is rejected; resume index remains 1 |
| Resume offset after completed batch 0 | offset returned to batch 0 | resume starts at batch 1 |
| Redirected enrichment output | downstream used the requested path | downstream consumes and verifies the reported path |
| Legacy history initialisation | `no such column: owner_scope` | row preserved; composite key and owner index verified |
| Current release artifact | candidate contained 269 identity-invalid rows and 1,574 links would dangle after a naive exclusion | v1.0 excludes them with a ledger, rebuilds alternatives and passes 4,731/4,731 records |

## Limits and ownership boundaries

- A passing sample readback proves the selected records reached the correct
  collection; it is not a full comparison of every Firestore document.
- DB060 remains the source for record-level data-quality reasons. This gate calls
  it and carries its decision forward rather than duplicating its rules.
- DB057 remains the source for allergen detection and unknown-state safety. This
  gate owns the artifact handoff contract around enrichment modules.
- The gate does not approve a release. A pass means automated controls succeeded
  and provides evidence for the team's release decision.
