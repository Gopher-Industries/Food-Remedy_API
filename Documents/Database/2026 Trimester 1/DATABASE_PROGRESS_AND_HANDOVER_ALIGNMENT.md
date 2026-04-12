# Food Remedy Database Progress and Handover Alignment

## Professional summary

This document explains how the database and enrichment work in the Food-Remedy_API repository compares to the previous FoodRemedy repository and to the official Trimester 3 handover expectations. The goal is to give a clear picture of what is done, what matches the handover, and what still needs attention. Language is kept simple so students and reviewers can scan it quickly.

The database track covers scraping, cleaning, enriching, validating, and seeding product data so the mobile app can show nutrition, allergens, tags, and recommendations. As of T1 2026, cleaning code is consolidated under **`database/clean_data/`** with matching Python imports. The mobile app login flow uses configurable hCaptcha rules with development-friendly defaults; see the T1 workflow guide under `Documents/Guides/General/`. Some pipeline default paths may still need alignment with files present in each clone.

## Keywords for search and review systems

Food Remedy, database pipeline, data enrichment, Open Food Facts, Firestore seeding, schema validation, nutrient normalisation, category harmonisation, allergen detection, conflict resolution, product detail API, clean enrich seed workflow, Python data pipeline, handover documentation, trimester continuity, clean_data package, local development, T1 2026

## Project context

Food Remedy is a student-led project. Product data starts from public sources (for example Open Food Facts for Australia). Scripts clean and standardise records, add scores and tags, then upload structured data for the app. The Trimester 3 handover document describes what the database team aimed to deliver and what the next team should finish.

This note focuses on the **Food-Remedy_API** folder. It also refers to the **FoodRemedy** repository as the prior trimester reference copy and to the PDF titled **Food Remedy API Trimester 3 Handover** for official scope wording.

## What the handover asked the database team to cover

In simple terms, the handover described:

- A **cleaning** path: consistent schema, ingredient cleanup, logging, and quality checks on sample data.
- **Enrichment**: categories aligned, nutrient units normalised, nutrition scoring, mood and health style tags, dietary and lifestyle tags, risk or processing style signals, and rules to resolve conflicting tags.
- A **pipeline** that runs clean, then enrich, then seed, with checkpoints and chunk-friendly processing for large datasets.
- **Firestore-oriented** seeding with batching and retries where relevant.
- **Clear field names** so the product detail view and API stay stable.
- A **mapping step** from enriched database records to the shape the app expects.

The handover also listed follow-up work: final automation reliability, more conflict resolution, large-scale validation (for example tens of thousands of records), and keeping one clear schema as the source of truth.

## Current status in Food-Remedy_API (this repository)

**Strengths**

- There is **written schema and data flow documentation** for 2026 Trimester 1 (DB015 in this folder). It lists product fields, indexes, and how cart and recommendations depend on those fields.
- **Single cleaning package path:** `database/clean_data/` with `database/__init__.py` and package initialisers so imports such as `database.clean_data.normalization` work for mapping, tests, and tooling.
- The **pipeline clean stage** applies nutrient unit normalisation during cleaning, which supports consistent nutrition values before enrichment.
- The **pipeline configuration** can run Python enrichment modules such as allergen enrichment and personalisation tags, which matches the idea of a modular enrich stage.
- A **mapping module** exists that turns an enriched product record toward the product detail style contract, including normalised nutrients and category handling, with a hook for conflict resolution on tags.
- Supporting areas remain present: logging, validation scripts, seed engine, allergen reference data, and investigation samples.
- **Local app workflow (T1 2026):** Login captcha defaults off in development so web and Expo flows work without hCaptcha localhost registration; production defaults and environment overrides are documented in `Documents/Guides/General/t1-2026-workflow-and-local-development.md`.

**Items that need alignment or follow-up**

- The default **pipeline config** may point to an enrich input file that is not present in every clone (for example a fixed path to a five-thousand-record enriched file). Document or generate that file before promising a one-command pipeline run.
- **Clean stage** may be turned off in the default config while enrich still expects pre-built data. Align defaults with committed samples or document the generation order.
- **Large chunked datasets** (for example ten-thousand product slices and enriched counterparts) may exist in the prior FoodRemedy copy but not in the same way here. Large-scale validation is a handover next step; commit a documented subset, use Git LFS, or document where full files live.

---

## Comparison at a glance: Food-Remedy_API versus FoodRemedy reference

| Topic | Food-Remedy_API (this repo) | FoodRemedy (prior reference) |
|-------|------------------------------|------------------------------|
| Schema and deployment notes for T1 | Added (DB015 style documentation) | Older readme style only |
| Default pipeline clean step | Often disabled in config; clean code can normalise nutrients when run | Clean enabled in sample config |
| Default enrich input | May point to specific enriched JSON absent in some clones | Includes multiple chunk files and five-thousand test enriched file in tree |
| Mapping to product detail | Present | Present (same overall pattern) |
| Cleaning folder layout | Single `database/clean_data/` package | May still use mixed naming in older snapshots |

---

## Alignment with handover requirements (simple checklist)

- Cleaning and QA foundations: **Partially met** in code and folders; default run path may still need fixing for new clones.
- Enrichment modules (tags, allergens, personalisation): **Met** in principle via pipeline modules; breadth depends on which modules stay enabled in config.
- Pipeline orchestration clean enrich seed: **Met in code**; **not fully met in default configuration and data files** until inputs exist and clean is wired as documented.
- Firestore seeding and batching: **Met** in seed engine pattern; depends on valid enriched input.
- Stable contract and documentation for the app: **Improved** via DB015; field list should stay in sync with `schema_definition.json` and mapping output.
- Large-scale validation: **Not evidenced** the same way in this repo tree as in the prior reference; treat as planned or external storage.

---

## Recommended next steps (short list)

1. Update **pipeline.config.json** so clean, enrich, and seed inputs and outputs point only to files that exist in the repo or to a documented script that generates them.
2. Regenerate or document how to create **products_5k_enriched.json** (or point the config at **products_enriched.json** if that is the official sample for your team).
3. Record where **large datasets** live if they are not in Git, and add commands and expected outputs to the T1 workflow guide when you stabilise the runbook.

---

## Related files (quick reference)

| Purpose | Location |
|---------|----------|
| T1 workflow, captcha, local dev | `Documents/Guides/General/t1-2026-workflow-and-local-development.md` |
| Database folder overview | `database/DATABASE-README.md` |
| Schema, flow, deployment (T1) | `Documents/Database/2026 Trimester 1/DB015-Schema-DataFlow-Documentation.md` |
| Pipeline entry point | `database/pipeline/run_pipeline.py` |
| Pipeline settings | `database/pipeline/pipeline.config.json` |
| Clean stage | `database/pipeline/stages/clean_stage.py` |
| Enrich stage | `database/pipeline/stages/enrich_stage.py` |
| Map enriched record to API shape | `mapping/map_enriched_to_product_detail.py` |
| Seeding | `database/seeding/seed_engine.py` |
| Captcha configuration | `mobile-app/config/captchaConfig.ts` |

---

## Closing note

This document is a status and alignment summary. It is not a grade and not a full audit of every file. For the latest behaviour, always check the actual scripts and configuration in the repository after any merge.

If you update the pipeline or schema, update this file in the same trimester folder so the next handover stays accurate.
