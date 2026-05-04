# DB032 Validation Runbook

This runbook validates merged database outputs before treating a dataset as production-ready.

It covers:
- batch checks (schema, barcode quality, required fields, inconsistencies)
- integration-style checks for barcode lookup, category queries, and recommendation candidate readiness

## Script location

- `scripts/db032_validation_suite.py`

## Quick commands

Run on a 5k sample:

```bash
python scripts/db032_validation_suite.py --input database/seeding/products_5k_test.json --sample-size 200
```

Run on a 50k+ slice:

```bash
python scripts/db032_validation_suite.py --input database/seeding/products_50k+.json --sample-size 500 --report scripts/reports/db032_50k_report.json
```

## Verify outputs

The command prints pass/fail plus issue counts per check.

A JSON report is written to:
- default: `scripts/reports/db032_validation_report.json`
- or the path provided with `--report`

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
- Use at least one 5k run and one larger run (for example 50k) to monitor stability and issue patterns.
- If systemic issues appear, quarantine affected slices and fix pipeline rules before re-running.
