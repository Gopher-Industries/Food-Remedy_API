# DB032 Validation Runbook

This runbook validates merged database outputs before treating a dataset as production-ready.

It covers:
- batch checks (schema, barcode quality, required fields, inconsistencies)
- integration-style checks for barcode lookup, category queries, and recommendation candidate readiness
- reproducible remediation for systemic DB032 issue clusters

## Script location

- `scripts/db032_validation_suite.py`
- `scripts/remediate_db032_dataset.py`
- `database/pipeline/modules/db032_remediation.py`

## Quick commands

### 1) Baseline validation (before remediation)

Run on a 5k sample:

```bash
python scripts/db032_validation_suite.py --input database/seeding/products_5k_enriched.json --sample-size 200 --report scripts/reports/db032_before_5k.json --allow-issues
```

Run on a 50k+ slice:

```bash
python scripts/db032_validation_suite.py --input database/seeding/products_50k+_enriched.json --sample-size 500 --report scripts/reports/db032_before_50k.json --allow-issues
```

### 2) Apply remediation in clean/enrich pipeline output

Remediate 5k slice:

```bash
python scripts/remediate_db032_dataset.py --input database/seeding/products_5k_enriched.json --output database/seeding/products_5k_enriched_db032_remediated.json --evidence scripts/reports/db032_remediation_5k.json
```

Remediate larger slice:

```bash
python scripts/remediate_db032_dataset.py --input database/seeding/products_50k+_enriched.json --output database/seeding/products_50k+_enriched_db032_remediated.json --evidence scripts/reports/db032_remediation_50k.json
```

### 3) Re-run DB032 validation (after remediation)

```bash
python scripts/db032_validation_suite.py --input database/seeding/products_5k_enriched_db032_remediated.json --sample-size 200 --report scripts/reports/db032_after_5k.json --allow-issues
python scripts/db032_validation_suite.py --input database/seeding/products_50k+_enriched_db032_remediated.json --sample-size 500 --report scripts/reports/db032_after_50k.json --allow-issues
```

## Verify outputs

Each command prints pass/fail plus issue counts per check.

A JSON report is written to:
- default: `scripts/reports/db032_validation_report.json`
- or the path provided with `--report`

Evidence files are written for remediation coverage:
- `scripts/reports/db032_remediation_5k.json`
- `scripts/reports/db032_remediation_50k.json`

Inspect summary fields:

```bash
python -c "import json; r=json.load(open('scripts/reports/db032_validation_report.json', encoding='utf-8')); print(r['ok']); print(r['checks']['integration_validation'].keys())"
```

## Optional flags

- `--sample-size`: number of records sampled for integration checks
- `--seed`: deterministic random seed
- `--allow-issues`: exit code 0 even if checks fail (useful for exploratory runs)

## Notes for handover alignment

- Keep this validation run after merge and before large-scale seeding.
- Use at least one 5k run and one larger run (target 50k+, or largest available) to monitor stability and issue patterns.
- If systemic issues appear, quarantine affected slices and fix pipeline rules before re-running.
- Attach before/after report pairs and remediation evidence JSON files in ticket/PR for reviewer verification.
