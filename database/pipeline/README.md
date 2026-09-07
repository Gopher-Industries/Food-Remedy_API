# Data Pipeline Guide (Clean → Enrich → Seed)

## Overview
The Food Remedy data pipeline processes Open Food Facts Australia products through three main stages:

1. **Clean** – Standardise and clean raw data
2. **Enrich** – Apply allergens, diet/personalisation tags, mood tags, health scoring, alternative mapping, etc.
3. **Seed** – Upload enriched products to Firestore with batching, rate limiting, retry, and checkpointing

The pipeline is designed to be **repeatable**, **observable**, and **auditable**.

## How to Run the Pipeline

```bash
# Normal run (follows config)
python -m database.pipeline.run_pipeline --config database/pipeline/pipeline.config.json

# Force re-run enabled stages (ignore checkpoints)
python -m database.pipeline.run_pipeline --config database/pipeline/pipeline.config.json --force

# Safe testing (recommended)
python -m database.pipeline.run_pipeline --config database/pipeline/pipeline.config.json --force --dry-run
```

## Output Files

- **Structured Logs**: `database/logs/pipeline_YYYY_MM_DD.log` (*on local side only*)
- **Run Metadata**: `database/pipeline/pipeline_run_metadata.json`
- **Checkpoints**: `database/pipeline/pipeline_checkpoints.json`

## Understanding the Logs and Metadata

The pipeline now produces structured information:

- Start time and end time (`event=stage_start` and `event=stage_end`)
- Timestamps (`started`, `finished`)
- `config_summary` (enabled status and dry-run flag)
- `modules_summary` for enrich stage (per-module results)
- Clear `output_records`, `failures`, and other context

Example `stage_end` line:
```
event=stage_end ... stage=enrich output_records=5000 failures=0 ... finished=... config_summary_enabled=True config_summary_dry_run=True modules_summary=[...]
```

## How to Diagnose Problems

1. Open the latest `pipeline_*.log`
2. Look for `event=stage_end` with `failures > 0` or `event=stage_error`
3. Check `pipeline_run_metadata.json` for detailed per-stage information (timestamps, config, modules)
4. Use `--force` to ignore completed checkpoints and re-run enabled stages. To run only one stage, disable other stages using their `--no-*` options.

## Key Features

- Checkpoint recovery (can resume from last successful point)
- Rate limiting & retry logic for Firestore
- Structured logging + metadata
- Dry-run mode is available for safe testing (i.e. no upload to Firestore)
- Automatic dataset quality report after successful seeding when dry-run mode is off 
