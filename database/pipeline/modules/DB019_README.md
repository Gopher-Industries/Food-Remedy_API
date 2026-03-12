# DB019: Firestore Schema & Pre-Seeding Validation

## Overview
This module defines the Firestore schema for enriched product documents and provides pre-seeding validation to ensure data consistency before writing to the database.

- **schema_definition.json**: Blueprint for product documents (required fields, types, constraints, indexes).
- **pre_seeding_validation.py**: Validates enriched JSON records, applies safe fallbacks, generates error reports, and passes through valid data.

Goal: Prevent invalid or inconsistent data from entering Firestore, ensuring reliable app performance.

## Key Features
- Required fields: barcode, productName (with auto-fallback if missing)
- Type & constraint checks: completeness (0–1), nutriments as dict, allergensDetected as string array, etc.
- Auto-fix for missing productName (fallback to "Product barcode {barcode}")
- Full report generation (total, invalid count, detailed errors per barcode)
- CLI support for full/subset runs
- Pass-through output (validated data copied to new file)

## How to Run
```bash
# Full run on 5k enriched data
python pre_seeding_validation.py --input ../../seeding/products_5k_enriched.json --output ../../seeding/validated_enriched.json --report ../../seeding/schema_validation_report.json

# Quick test on first 500 records
python pre_seeding_validation.py --subset 500
```

## Output:
- Console summary (processed, invalid, error rate)
- Report JSON with per-record errors
- Validated output JSON (with auto-fixes applied)

## Test Results (5,000 records)
- Total processed: 5000
- Invalid records: 7 (0.14% error rate)
- All issues: Missing productName (auto-fixed with fallback "Product barcode {barcode}")
- Average validation time per record: ~0.000047 s

## Known Limitations / TODO
- productName is required yet some records have null but fallback applied. Future pipeline can improve source data.
- Indexes are recommended but not enforced yet (add via Firestore console after seeding).
- No deep value validation (e.g., nutriscoreGrade enum enforcement) — can be added if needed.

## Integration
Add as a module in enrich_stage.py or run as final check before seeding.
