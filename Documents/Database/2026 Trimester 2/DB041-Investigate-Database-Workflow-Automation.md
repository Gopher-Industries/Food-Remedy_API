# DB041 – Investigate Database Workflow Automation Investigation Report

**Ticket ID:** DB041  
**Status:** Complete (Investigation Only)  
**Author:** ANJUM ASIYA  
**Target Application:** Food Remedy API / Database Seeding & Pipeline  
**Scope:** Evaluation of the end-to-end database pipeline workflow (`Clean -> Enrich -> Validate -> Seed`), identification of automated vs. manual steps, risk assessment of manual touchpoints, and recommendation of high-impact automation opportunities.

---

## 1. Executive Summary

This investigation evaluates opportunities to reduce manual touchpoints and improve consistency, repeatability, and developer experience across the Food Remedy database workflow.

### Key Takeaways
- **Current Pipeline Automation State:** The core execution runner (`database/pipeline/run_pipeline.py`) automates stage sequencing (`clean`, `enrich`, `seed`) and basic CI runs via `.github/workflows/pipeline.yml`. However, several critical operational steps remain strictly **manual**.
- **Key Manual Touchpoints Identified:**
  1. Data validation (`pre_seeding_validation.py` / `schema_validator.py`) is not automatically enforced by the pipeline runner prior to seeding.
  2. Dataset acquisition and raw file placement (`database/seeding/products_*k.json`) are completely manual.
  3. Environment configuration and credential management (`serviceAccountKey.json`) rely on local developer machine setup.
- **Investigated Automation Opportunities:**
  - **Opportunity A: Enforced Pre-Seeding Validation Stage in Runner:** Automatically executing schema and barcode validation as a blocking gate before Firestore seeding.
  - **Opportunity B: Automated CI/CD Data Verification & Staging Seeding:** Expanding GitHub Actions workflows to validate data changes on PR creation and seed to a staging database automatically.
- **Non-Interference:** This ticket is investigation-only; no existing source code, configuration files, or seeding behaviors were altered.

---

## 2. End-to-End Database Workflow Mapping

The current database workflow consists of five distinct phases:

```
[1. Raw Ingestion] (Manual)
        │
        ▼
[2. Clean Stage] (Semi-Automated via run_pipeline.py --clean)
        │
        ▼
[3. Enrich Stage] (Automated via run_pipeline.py --enrich)
        │
        ▼
[4. Validation Stage] (Manual / Disconnected Execution)
        │
        ▼
[5. Seed Stage] (Semi-Automated via run_pipeline.py --seed / seed_firestore.py)
        │
        ▼
[6. Quality Reporting] (Automated post-seed hook)
```

### Detailed Workflow Step Analysis

1. **Phase 1: Ingestion (Manual):**
   - Developers manually download OpenFoodFacts data dumps or place JSON chunk files (e.g. `products_0k_10k.json`) into `database/seeding/`.
2. **Phase 2: Cleaning (Semi-Automated):**
   - Executes `cleanProductData.py` to remove typos, collapse whitespace, and normalize category tags. Driven by `run_pipeline.py`, but disabled by default in `pipeline.config.json` (`"enabled": false`).
3. **Phase 3: Enrichment (Automated):**
   - Executes sequential enrichment modules (`allergens`, `personalisation_tags`, `mood_tags`, `alternative_product_mapping`, `ts_wrapper`) on product records.
4. **Phase 4: Validation (Manual / Disconnected):**
   - Runs `schema_validator.py` or `pre_seeding_validation.py` to check barcode formatting (8, 12, 13, 14 digits) and schema compliance. **Currently requires manual CLI invocation by developers prior to seeding.**
5. **Phase 5: Seeding (Semi-Automated):**
   - Seeds processed JSON records into Cloud Firestore (`seed_firestore.py`) or local SQLite (`sqlite_product_catalog.py`). Requires manual environment variable setup (`GOOGLE_APPLICATION_CREDENTIALS` or `serviceAccountKey.json`).
6. **Phase 6: Reporting & Checkpointing (Automated):**
   - Generates `dataset_quality_report.md` via `_run_db018_quality_report()` and updates `pipeline_run_metadata.json` and `pipeline_checkpoints.json`.

---

## 3. Identification of Automated vs. Manual Steps

| Workflow Phase | Current Status | Automation Level | Friction & Reliability Risk |
| :--- | :---: | :---: | :--- |
| **Data Ingestion** | Manual | 0% Automated | Risk of stale or malformed source JSON files being processed without version tracking. |
| **Clean Stage** | Config-Driven | 50% Automated | Disabled by default in config; requires manual CLI flags (`--clean`) or config editing to run. |
| **Enrich Stage** | Runner-Driven | 90% Automated | Runs automatically via `run_pipeline.py` or GitHub Actions workflow (`.github/workflows/pipeline.yml`). |
| **Data Validation** | Standalone Script | **0% Automated in Pipeline** | High risk of seeding corrupted or unvalidated records directly into Firestore if developers forget to run validation manually. |
| **Seeding Execution** | CLI / Script | 60% Automated | Safe mode requires explicit `--seed` flag, but relies on manual local credential handling. |
| **Quality Reporting** | Post-Seed Hook | 100% Automated | Automatically executes after seeding and updates metadata. |

---

## 4. Reliability & Consistency Risks of Manual Steps

1. **Risk 1: Unvalidated Seeding to Firestore (High Severity)**
   - Because data validation (`pre_seeding_validation.py`) is disconnected from `run_pipeline.py`, there is no blocking mechanism preventing invalid product records (e.g. missing GTINs, invalid allergen keys) from being written directly to production Firestore collections.
2. **Risk 2: Credential & Environment Exposure (Medium Severity)**
   - Manual seeding from local developer environments requires managing `serviceAccountKey.json` files locally, introducing risks of key leakage, credential drift, or accidental seeding to the wrong Firestore project.
3. **Risk 3: Configuration Drift Between Local & CI Environments (Medium Severity)**
   - Manual toggling of `pipeline.config.json` options during local development can lead to accidental commits of local file paths or disabled stages, causing CI automated pipeline runs (`.github/workflows/pipeline.yml`) to fail or skip stages unexpectedly.

---

## 5. Investigation of Automation Opportunities

### Opportunity A: Integrated Pre-Seeding Validation Stage in Runner

#### Implementation Concept
Wire `pre_seeding_validation.py` directly into `run_pipeline.py` as an explicit **Validate Stage** inserted between `enrich` and `seed`:

```python
# Proposed Pipeline Stage Sequence in run_pipeline.py
run_clean_stage(...)
run_enrich_stage(...)
run_validation_stage(...) # Blocking Gate
run_seed_stage(...)
```

#### Benefits
- **Guaranteed Data Integrity:** Automatically prevents Firestore seeding if product validation checks fail.
- **Immediate Feedback:** Developers receive detailed validation failure reports before long-running seeding network operations start.

#### Risks & Mitigations
- *Risk:* Overly strict validation rules could block production releases for minor non-critical warnings.
- *Mitigation:* Implement configurable validation error thresholds (e.g. allow seeding if error rate is under 0.5%, but block if barcode primary keys are missing).

---

### Opportunity B: Automated CI/CD PR Verification & Staging Seeding Workflow

#### Implementation Concept
Enhance `.github/workflows/pipeline.yml` to run automated pipeline dry-runs on every Pull Request that modifies files in `database/`:

```yaml
on:
  pull_request:
    paths:
      - 'database/**'
```

#### Benefits
- **Zero-Touch PR Verification:** Automatically verifies that proposed database pipeline changes do not break data cleaning, enrichment, or validation logic.
- **Isolated Staging Seeding:** Seeds test datasets to a Firebase emulator or staging project automatically using GitHub Secrets, removing credential management from local developer machines.

#### Risks & Mitigations
- *Risk:* GitHub Actions runner timeouts or Firebase API quota exhaustion.
- *Mitigation:* Scope PR verification runs to small sample datasets (e.g., 500 records) and execute full catalog runs on scheduled nightly cron jobs.

---

## 6. Reviewed Files

- `database/pipeline/run_pipeline.py` (Pipeline orchestrator & schema validator)
- `database/pipeline/pipeline.config.json` (Pipeline configuration file)
- `database/pipeline/pipeline.config.schema.json` (Configuration schema definition)
- `.github/workflows/pipeline.yml` (GitHub Actions automated workflow)
- `scripts/run_pipeline_ci.sh` (CI wrapper script)
- `database/clean_data/cleanProductData.py` (Data cleaning implementation)
- `database/pipeline/stages/clean_stage.py` (Clean stage runner)
- `database/pipeline/stages/enrich_stage.py` (Enrichment stage runner)
- `database/pipeline/stages/seed_stage.py` (Seeding stage runner)
- `database/seeding/seed_firestore.py` (Firestore seeding implementation)
- `database/seeding/pre_seeding_validation.py` (Pre-seeding validation rules)
- `database/DATABASE-README.md` (Main database documentation)
- `database/pipeline/README.md` (Pipeline documentation)

---

## 7. Actionable Recommendations

1. **Short-Term (Next Trimester Cycle):**
   - Add a formal `validate` stage key to `pipeline.config.json` and enforce validation checks inside `run_pipeline.py` prior to `run_seed_stage()`.
2. **Medium-Term:**
   - Add PR trigger conditions to `.github/workflows/pipeline.yml` to automatically execute pipeline dry-runs on database code changes.
3. **Long-Term:**
   - Automate the end-to-end dataset update pipeline to automatically compile SQLite delta JSON packages (from ticket **DB035**) upon successful dataset release tagging.

---

*Report prepared for DB041 ticket completion.*
