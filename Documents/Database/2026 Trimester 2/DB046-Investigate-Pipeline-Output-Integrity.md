# DB046 – Investigate Pipeline Output Integrity

**Ticket ID:** DB046
**Status:** Complete (Investigation Only)
**Author:** Sneha
**Target Application:** Food Remedy API — Database Pipeline
**Scope:** Compare representative inputs and outputs between the clean, enrich, and seed stages to check whether product records or important fields are unexpectedly lost, duplicated, or changed as data moves through the pipeline.

---

## 1. Executive Summary

Where the pipeline's own bookkeeping (record counts, barcodes) can be checked directly, it holds up: the enrich stage's input and output contain exactly the same 5,000 records with exactly the same barcode set, and no duplicate or null barcodes were found anywhere across the three main dataset files. However, comparing the pipeline's *actual physical output files* against each other and against its own recorded run metadata surfaced a genuine, currently-live data-loss bug and several checked-in output artifacts that silently disagree with one another and with what the pipeline currently produces. The most significant finding: the `allergens` enrichment module writes its result to the wrong file path because of a path-resolution bug, so the canonical enriched dataset that every downstream stage reads is quietly missing the `allergensDetected` field and has an empty `allergens` field — while the pipeline's own metadata reports that module completed successfully with zero failures. Separately, the checked-in seed-stage output contains only 100 of the 5,000 records its own run metadata claims it wrote, and the sample outputs under `database/output/` — one of this ticket's own suggested starting points — are stale and no longer match what the current code produces from current inputs.

No pipeline code or configuration was changed while producing this report, per the ticket's acceptance criteria.

### Key Investigation Takeaways

- **Confirmed, reproducible field loss:** the allergens enrich module's output is written to `database/database/seeding/products_enriched.json` (a doubled, incorrect path) instead of the canonical `database/seeding/products_enriched.json`, so `allergensDetected` never reaches the file every other stage reads (Finding 2.1).
- **Seed output doesn't match its own metadata:** `seeded_products.json` has 100 records; `pipeline_run_metadata.json` claims the seed stage wrote 5,000 to that same path (Finding 2.2).
- **Stale reference outputs:** `database/output/chunk_0_*.json` no longer reflects what current code produces from current inputs (Finding 2.3).
- **Chunked utility runs every stage twice per chunk** (Finding 2.4) **and never actually seeds the chunk's own data** (Finding 2.5).
- **Identifier field names aren't translated between stages:** the clean stage keeps raw `id`/`code` field names; everything downstream expects `barcode` (Finding 2.6).
- **What does hold up:** record count and barcode set are identical between the enrich stage's input and output, and no duplicate or null barcodes exist anywhere in the three main dataset files (Finding 2.7).

---

## 2. Detailed Findings

### 2.1 The allergens enrich module silently writes to the wrong path, and the canonical enriched dataset is missing its output

`enrich_stage.py` chains modules by setting `current_input = target_output` after each module runs (line 77), where `target_output` is the plain, repo-root-relative string from config (e.g. `"database/seeding/products_enriched.json"`, since no module in the config sets its own `"output"` override). Three of the four configured enrich modules (`db009_personalisation_tags.py`, `db021_mood_tags.py`, `db019_alternative_product_mapping.py`) simply `open(output_path, ...)` as given, so they resolve it relative to the process's working directory — correct when the pipeline is run from the repo root as the README instructs.

`allergens_enrich.py` does something different: it explicitly resolves a relative `output_path` itself (lines 17–20), computing its own `repo_root` as two directories up from its own file location. Since `allergens_enrich.py` lives in `database/pipeline/modules/`, two directories up lands on `database/`, not the true repository root — the same class of mis-scoped `repo_root` bug already identified in DB045 (that investigation's Finding 2.5, in `enrich_stage.py`). The result: `allergens_enrich.py` always writes its output to `<repo_root>/database/database/seeding/products_enriched.json` — a doubled, incorrect path — regardless of what `target_output` says.

This is confirmed as a real, physical consequence, not just a theoretical one: a stray `database/database/seeding/products_enriched.json` currently exists in this checkout. Comparing it against the canonical file:

- `database/database/seeding/products_enriched.json` (5,000 records) — has both `allergens` (populated) and `allergensDetected` fields.
- `database/seeding/products_enriched.json` (5,000 records, the file every downstream consumer actually reads — the seed stage, the DB018 quality report, and the config's `enrich.output`) — has an `allergens` field that is an empty list (`[]`) on the sampled record, and **no `allergensDetected` field at all**.

Meanwhile `pipeline_run_metadata.json` records the `allergens` module as `"status": "ok", "processed": 5000, "failures": 0` (and even shows the doubled path in its own logged output field: `".../database/database/seeding/products_enriched.json"`). The pipeline reports success while the field it was supposed to add never reaches the file anything downstream actually consumes — a silent, currently-live loss of enrichment data that a "processed / failures" summary alone would never surface.

### 2.2 Seed-stage output doesn't match record counts implied by its own run metadata

`database/seeding/products_enriched.json` (seed stage input, per `pipeline.config.json`) has 5,000 records. `database/seeding/seeded_products.json` (seed stage output) has only 100. `pipeline_run_metadata.json` records the seed stage as `"status": "completed"`, `"result": {"processed": 5000, "failures": 0, "output": "database/seeding/seeded_products.json"}` — i.e. the pipeline's own audit trail says 5,000 records were written to the exact file that currently contains 100.

Checking further: `seeded_products.json`'s 100 records are, in order, exactly the first 100 records of `products_enriched.json` (verified directly, barcode-for-barcode). `seed_firestore.py`'s `run()` function writes its output as `json.dump(data, ...)` where `data` is the full loaded/processed record list, truncated only by an explicit `subset` config value (`database/seeding/seed_firestore.py`, "Handle subset" block, and the final write). This strongly indicates `seeded_products.json` was produced by a separate, smaller test run (consistent with a `subset: 100` seed run for manual verification), while `pipeline_run_metadata.json` reflects a different, later or earlier full run whose actual 5,000-record output was never committed in sync with it. Whatever the cause, the two checked-in files cannot both be an accurate record of the same run, and neither can currently be trusted on its own as "what seeding produces" without cross-checking the other.

### 2.3 `database/output/` — one of this ticket's own suggested starting points — contains stale sample outputs that no longer match current pipeline behaviour

`database/output/chunk_0_raw.json`, `chunk_0_clean.json`, and `chunk_0_enriched.json` are produced by `db018_runner.py` (a standalone performance-testing utility, not part of the `pipeline.config.json`-driven pipeline — see DB045's supporting observations for other modules in this category). Comparing them against the current source data and current code:

`chunk_0_raw.json` is a flat, 24-element JSON list of plain values (a barcode string, a brand string, nested lists, a nutriments object, an images object, and so on) — not a JSON object, and not a list containing one record object. This exactly matches `list(single_record_dict.values())` for the one record in `database/data_investigation/exampleProductRaw.json`, which has exactly 24 keys. Re-running the current `chunk_records()` / `load_json_records()` logic in `db018_batching.py` directly against the current `exampleProductRaw.json` (verified by executing it) produces the correctly-shaped `[{...24-key record dict...}]` instead — a list containing one proper record object. `chunk_records()` carries its own comment noting it was previously "FIXED" to handle dict input by exploding it into `list(records.values())` (lines 32–42) — the checked-in `chunk_0_raw.json` is consistent with having been generated *before* that fix (when the raw input path may have been a bare dict rather than the current list-of-one-dict), and was never regenerated afterward.

`chunk_0_clean.json` and `chunk_0_enriched.json` compound the problem: both are 3-element lists where element 0 is an empty object `{}`, element 1 is the record's raw `nutriments` sub-object, and element 2 is its `images` sub-object. None of the record's actual identifying or product fields (barcode/id, product name, brand, ingredients, etc.) appear anywhere in either file — they were lost in whatever process generated these particular fixtures. Anyone using `database/output/` as a reference for what the clean or enrich stage currently produces would be looking at output that doesn't reflect current code or current data.

### 2.4 `db018_runner.py` runs every chunk's full stage sequence twice

In `main()`'s per-chunk loop (lines 64–122), the sequence "write raw chunk → `run_clean_stage` → `run_enrich_stage` → `run_seed_stage` → `save_checkpoint`" appears twice: once inside the `try` block (lines 72–89) and then again, verbatim and unconditionally, immediately after the `except` block, at the same loop indentation but outside the `try` (lines 96–122). Every chunk this utility processes runs clean, enrich, and seed twice. If the seed step were pointed at a real target (Firestore, or a shared output file), this would double every write for every chunk.

### 2.5 The chunked path can't actually verify per-chunk output integrity, because it never seeds the chunk's own data

`db018_runner.py` calls `run_seed_stage(input_path=enrich_path, config={})` for each chunk (lines 83–86 and, per Finding 2.4, again at lines 116–119). But `seed_stage.py`'s branch for the default seed script — `seed_products.py`, which is what runs whenever no `script_path` override is supplied, exactly the case here — calls `module.seed_products()` with no arguments at all (`seed_stage.py`, lines 36–38); the `input_path` parameter passed into `run_seed_stage` is never forwarded into the actual seeding call. `seed_products()` then falls back to its own hard-coded defaults (`database/seeding/products_enriched.json` / `seeded_products.json`, `seed_firestore.py` lines 495–496) because an empty `config={}` sets neither `"input"` nor `"output"`. The practical effect: every chunk's "seed" step ignores that chunk's own enriched output entirely and instead reads and writes the single global file pair — repeated per Finding 2.4's duplication. This makes the chunked utility unsuitable, as currently written, for verifying per-chunk output integrity at all.

### 2.6 Identifier field names aren't translated between the clean stage and the rest of the pipeline

The real clean-stage output (`database/data_investigation/exampleProductCleaned.json`, produced by `clean_stage.py` from `exampleProductRaw.json`) preserves the raw Open Food Facts field names `id` and `code` unchanged — `clean_stage.py` never renames or maps them to anything else; it only JSON-stringifies nested list/dict values and adds `norm_*` nutrient fields. Every other file and stage in the pipeline — `products_5k_enriched.json`, `products_enriched.json`, `seeded_products.json`, all four enrich modules, and `seed_firestore.py`'s Firestore writer — reads and writes the product identifier exclusively as `barcode`. `seed_firestore.py`'s batch-commit logic explicitly skips any record with no `barcode` value (`if not barcode: docs_skipped += 1; checkpoint_mgr.add_failed_document(..., "Missing barcode")`, around line 404).

As DB045 already found (Finding 2.7 of that report), the clean stage is currently disabled by default and its output is never wired into the enrich stage's input, so this mismatch is presently masked. But it means that if the clean → enrich → seed chain were ever connected end-to-end as the pipeline README describes, every record passed through the clean stage would silently have no recognised `barcode`, and the seed stage would skip all of them without raising an error — a complete, silent loss of the entire dataset that would only be caught by noticing an unusually high "skipped" count in the seeding summary, if anyone were watching for it.

### 2.7 Where the pipeline's identifier handling does hold up

For balance: comparing `database/seeding/products_5k_enriched.json` (enrich stage input, 5,000 records) against `database/seeding/products_enriched.json` (enrich stage output, 5,000 records) directly, the two have exactly the same record count and exactly the same set of 5,000 barcodes — no records were added, dropped, or duplicated at the identifier level between enrich input and output. No null or empty `barcode` values and no duplicate `barcode` values were found in any of `products_5k_enriched.json`, `products_enriched.json`, or `seeded_products.json`. Within the boundary this investigation could directly verify (the top-level record/barcode bookkeeping of the currently-wired enrich stage), record identity is preserved correctly.

---

## 3. Files Reviewed

Runner and stages: `database/pipeline/run_pipeline.py`, `database/pipeline/stages/clean_stage.py`, `database/pipeline/stages/enrich_stage.py`, `database/pipeline/stages/seed_stage.py`.

Enrich modules: `database/pipeline/modules/allergens_enrich.py`, `database/pipeline/modules/db009_personalisation_tags.py`, `database/pipeline/modules/db021_mood_tags.py`, `database/pipeline/modules/db019_alternative_product_mapping.py`.

DB018 chunked utility: `database/pipeline/modules/db018_runner.py`, `database/pipeline/modules/db018_batching.py`.

Seed implementation: `database/seeding/seed_products.py`, `database/seeding/seed_firestore.py`.

Representative data compared: `database/data_investigation/exampleProductRaw.json` / `exampleProductCleaned.json` (clean stage, real fixture); `database/seeding/products_5k_enriched.json` / `products_enriched.json` (enrich stage); `database/seeding/products_enriched.json` / `seeded_products.json` (seed stage); `database/output/chunk_0_raw.json` / `chunk_0_clean.json` / `chunk_0_enriched.json` (DB018 utility sample output); `database/database/seeding/products_enriched.json` (orphaned copy, evidence for Finding 2.1); `database/pipeline/pipeline_run_metadata.json` (checked-in run metadata used as a cross-check against actual output files).

---

## 4. Recommendations

Fix `allergens_enrich.py`'s `repo_root` calculation to resolve to the true repository root (the same fix DB045 already recommends for `enrich_stage.py`), and re-run the enrich stage so the canonical `products_enriched.json` actually contains the allergens module's output; delete the orphaned `database/database/` directory once confirmed unneeded. Add a lightweight integrity check at the end of the enrich stage — e.g. comparing input and output record counts, and confirming each configured module's declared output fields are actually present on a sample record — so a future instance of this class of bug fails loudly instead of reporting `"failures": 0`. Regenerate or remove the checked-in `database/output/chunk_0_*.json` sample files so they reflect current code and current data, or better, generate them freshly as part of a test rather than committing static output. Regenerate `seeded_products.json` from a full run (or clearly mark it as a `subset` sample in its filename/location) so it isn't misread as a complete, current output, and keep `pipeline_run_metadata.json` and its corresponding output files committed together from the same run going forward. Fix the duplicated per-chunk block in `db018_runner.py` (Finding 2.4) and have it forward the chunk's own `input_path`/`output_path` into the seed call explicitly rather than relying on the seed script's own hard-coded defaults (Finding 2.5) — this likely means passing `script_path` plus explicit `input`/`output` keys in the `config` dict, mirroring how `pipeline.config.json` does it for the main pipeline. Finally, either have `clean_stage.py` rename `id`/`code` to `barcode` (and align other field names with what enrich/seed expect) before it's ever wired into the rest of the pipeline, or make the enrich/seed stages tolerant of both naming conventions — otherwise connecting clean → enrich as the README currently describes will silently drop the entire dataset at the seed stage.

---

## 5. Note

This was an investigation-only ticket; no pipeline code or configuration was changed while producing this report, per the acceptance criteria.
