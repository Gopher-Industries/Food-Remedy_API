# DB045 – Investigate Pipeline Configuration Consistency

**Ticket ID:** DB045
**Status:** Complete (Investigation Only)
**Author:** Sneha
**Target Application:** Food Remedy API — Database Pipeline
**Scope:** Review of `database/pipeline/pipeline.config.json`, `database/pipeline/pipeline.config.schema.json`, `run_pipeline.py`, and the clean/enrich/seed stage and module files to determine whether pipeline configuration is clear, consistent, and correctly used across the workflow.

---

## 1. Executive Summary

The pipeline's configuration is functional and the three stages (clean → enrich → seed) run in the order the pipeline README describes, but this investigation found several places where the configuration, its schema, and the code that consumes it have drifted apart. The most significant issues: two independent copies of the config schema that no longer agree with each other or with the code; a config value (`max_retries`) that is used at runtime but isn't declared in either schema; an enrich-stage input path whose filename is actively misleading about what it contains; a seed-stage input/output path that gets computed twice through two different code paths that could disagree; and a set of "tuning" values in the config that are exact duplicates of hard-coded defaults already in the module code. None of these currently break a pipeline run with the checked-in config, but several are latent — they only produce the wrong behaviour once someone edits the config in a way that looks reasonable.

No pipeline code or configuration was changed while producing this report, per the ticket's acceptance criteria.

### Key Investigation Takeaways

- **Schema drift:** `run_pipeline.py` embeds its own fallback copy of the config schema, and it no longer matches the standalone `pipeline.config.schema.json` file (Finding 2.1).
- **Undocumented config keys:** `seed.max_retries` is read by the seed implementation but isn't declared in either schema (Finding 2.2).
- **Misleading path convention:** enrich module `path` values use a different relative-path base than every other path in the config, because of a mis-scoped `repo_root` calculation in `enrich_stage.py` (Finding 2.5).
- **Duplicate path resolution:** the seed stage's input/output paths are computed once in `run_pipeline.py` and again, independently, inside `seed_firestore.py` (Finding 2.6).
- **Misleading naming:** `enrich.input` points at `products_5k_enriched.json`, which is actually the raw pre-enrichment dataset, not enrichment output (Finding 2.7).
- **Duplicated defaults:** every tuning value configured for the `db019` module is identical to that module's own hard-coded default (Finding 2.8).

---

## 2. Detailed Findings

### 2.1 Two copies of the config schema exist, and they disagree with each other

`database/pipeline/pipeline.config.schema.json` is a standalone schema file, but `run_pipeline.py` also carries its own embedded copy, `PIPELINE_SCHEMA` (lines 84–133), which it falls back to only when the standalone file is missing (`_validate_config_schema`, lines 136–155). The two have drifted: the standalone schema requires `fail_on_error` and requires the top-level `pipeline` key (schema file, lines 4 and 8), while the embedded fallback requires neither. The embedded fallback's `seed` section only declares `enabled`, `input`, and `script_path` (run_pipeline.py, lines 122–129), while the standalone schema's `seed` section additionally declares `output`, `batch_size`, `writes_per_second_limit`, `validate_before_seed`, `dry_run`, and `subset` (schema file, lines 42–55). This hasn't caused a visible failure yet, but the strictness of config validation currently depends on whether a file happens to exist on disk, and the two schemas will keep drifting further apart every time only one of them is updated.

### 2.2 `max_retries` is used by the seed stage but isn't declared in the schema

`pipeline.config.json` sets `seed.max_retries: 3` (line 70) and `seed_firestore.py` reads it directly (`max_retries = int(config.get("max_retries", 3))`, line 249; documented in that function's own docstring at line 236). Neither schema lists `max_retries` as a property of `seed`. It's a real, load-bearing config key the schema doesn't know about.

### 2.3 A per-module `output` key is read by the enrich stage but isn't part of the schema

`enrich_stage.py` looks for an `output` key on each module entry (`target_output = m.get("output") or output_path`, line 68), but neither schema's `modules` item definition lists `output` alongside `name`, `path`, `enabled`, and `config` (schema file, lines 29–39). No module in the current config uses it, so every module currently writes to the same shared `enrich.output` path, overwriting the previous module's file each run — apparently intentional, but undiscoverable from the schema alone.

### 2.4 `clean.script_path` is declared in the schema but never read by the clean stage

Both schemas declare `script_path` as a valid property of `clean` (schema file, line 18), matching the pattern used for `seed.script_path`, which really is read by `seed_stage.py` (line 26). `clean_stage.py`, however, takes only `input_path`, `output_path`, and a `config` dict it never inspects for a script path — it cleans and normalises inline rather than delegating to an external script. The schema implies a capability the implementation doesn't provide.

### 2.5 Enrich module `path` values use a different relative-path base than every other path in the config

Every input/output path elsewhere in `pipeline.config.json` is written relative to the repository root, e.g. `"input": "database/seeding/products_5k_enriched.json"` (line 15) or `"sidecar_index_path": "database/seeding/product_alternatives_index.json"` (line 58). Each enrich module's `path` is written one level shorter, e.g. `"path": "pipeline/modules/allergens_enrich.py"` (line 28), omitting the leading `database/`. This is required by how the path resolves: `enrich_stage.py` builds its own `repo_root` as two directories up from itself (line 59), but `enrich_stage.py` lives in `database/pipeline/stages/`, so two levels up lands on `database/`, not the repository root. `run_pipeline.py` computes what it also calls `repo_root` the same way — two directories up (line 7) — but since `run_pipeline.py` lives one level higher, in `database/pipeline/`, its `repo_root` correctly lands on the true repository root. Identical-looking code produces two different bases depending on which file it's in, and the module `path` values have been written to compensate for the shallower one. `seed_stage.py` computes a third, correct repo root by going up three levels (lines 22–24) and carries a comment — "FIXED: correct repo root (FoodRemedy)" — suggesting this exact class of bug has already caused problems in this pipeline before.

### 2.6 The seed stage's input/output paths are resolved twice, through two different code paths

`run_pipeline.py` computes `in_path` for the seed stage from `seed_cfg.get("input", ...)` (line 427) and passes it into `run_seed_stage(input_path=in_path, config=seed_cfg)` (line 440). But when `script_path` points at `seed_firestore.py` — which is what the current config does (line 67) — `seed_stage.py` never forwards that `input_path` argument; it calls `module.seed_products()` with no arguments (lines 36–38), and `seed_products()` re-derives its own input/output paths straight from the config dict (`in_rel = config.get("input")`, `out_rel = config.get("output")`, `seed_firestore.py` lines 507–508). The `in_path` computed in `run_pipeline.py` ends up used only for a log line and a checkpoint record, not for the actual Firestore write. The two resolutions happen to agree today only because they both read the same config key — nothing enforces that they stay in sync if either is changed independently.

### 2.7 The clean → enrich chain is configured as disconnected, and the enrich input's filename is misleading

The README describes the pipeline as Clean → Enrich → Seed, but in `pipeline.config.json` the `clean` stage is disabled (`"enabled": false`, line 9) and its configured output, `database/data_investigation/exampleProductCleaned.json` (line 11), is unrelated to `enrich.input`, which points at `database/seeding/products_5k_enriched.json` (line 15) — a separate, independently maintained file. That file's name says "enriched," but it is in fact the *raw* input the enrich stage consumes: it contains 5,000 records with only base Open Food Facts fields and none of the allergen, mood, or personalisation tags the enrich stage adds. A file that looks, by name, like enrichment *output* is configured as enrichment *input*.

### 2.8 Config values for the `db019` module exactly duplicate the module's own hard-coded defaults

`pipeline.config.json` sets nine tuning values under the `db019_alternative_product_mapping` module's `config` (lines 48–59): `max_similar: 5`, `max_healthier: 5`, `max_peers_scan: 400`, `healthier_min_score_delta: 2`, `max_nutrient_distance_healthier: 0.55`, `healthier_allow_any_score_gain: true`, `healthier_use_sugar_proxy: true`, `healthier_use_fiber_proxy: true`, and `rng_seed: 20260419`. Every one is identical to the default already hard-coded in `db019_alternative_product_mapping.run()` (lines 429–437, e.g. `max_similar = int(cfg.get("max_similar", 5))`). The config entries currently do nothing except restate the code's defaults, so the two can silently diverge — a future change to the code's default would have no visible effect while the config restates the old value, masking the change.

### 2.9 Hard-coded fallback paths for pipeline outputs don't match the configured path convention

If `outputs.checkpoints` or `outputs.metadata` were ever absent from the config, `run_pipeline.py` falls back to `os.path.join(repo_root, "database", "pipeline_checkpoints.json")` (line 248) and `os.path.join(repo_root, "database", "pipeline_run_metadata.json")` (line 507) — both missing the `pipeline/` path segment that the actual configured values use (`database/pipeline/pipeline_checkpoints.json` / `database/pipeline/pipeline_run_metadata.json`, config lines 5–6). This is currently masked because both keys are always present in the checked-in config, but the hard-coded defaults would write to a different, currently nonexistent location if either key were ever removed.

### 2.10 Configured output locations can be silently overridden at runtime

Independent of the config file, `run_pipeline.py` (lines 193–235) checks for a writable `/data` directory and, when running on a non-Windows host where one exists, silently redirects `outputs.metadata` and `outputs.checkpoints` away from whatever `pipeline.config.json` specifies. Presumably intended for containerised deployments, but it means the config file alone doesn't reliably describe where those two files end up — the answer depends on the host environment at run time, and this isn't documented anywhere near the `outputs` keys themselves.

### 2.11 Supporting observations

Several files under `database/pipeline/modules/` — `db018_runner.py`, `db021_runner.py`, `missing_field_handler.py`, `noop_enrich.py`, and `pre_seeding_validation.py` — are not referenced by any entry in `pipeline.config.json` and aren't imported by the stage files either; they appear to be standalone utilities rather than pipeline-config-driven modules. Separately, three of the five configured enrich modules (`allergens`, `db009_personalisation_tags`, `db021_mood_tags`) are given an empty `"config": {}` object (config lines 30, 36, 42) — consistent with taking no tunable parameters today, but nothing marks the empty object as intentional versus a placeholder.

---

## 3. Files Reviewed

Configuration and schema: `database/pipeline/pipeline.config.json`, `database/pipeline/pipeline.config.schema.json`.

Runner: `database/pipeline/run_pipeline.py`.

Stages: `database/pipeline/stages/clean_stage.py`, `database/pipeline/stages/enrich_stage.py`, `database/pipeline/stages/seed_stage.py`.

Enrich modules referenced by config: `database/pipeline/modules/allergens_enrich.py`, `database/pipeline/modules/db009_personalisation_tags.py`, `database/pipeline/modules/db021_mood_tags.py`, `database/pipeline/modules/db019_alternative_product_mapping.py`, `database/pipeline/modules/enrich_ts_wrapper.py`.

Seed implementation: `database/seeding/seed_products.py`, `database/seeding/seed_firestore.py`.

Supporting: `database/pipeline/README.md`, and a directory listing of `database/pipeline/modules/` and `database/seeding/` to check which files are and aren't reachable from the config.

---

## 4. Recommendations

Treat the standalone `pipeline.config.schema.json` as the single source of truth and remove or auto-generate the embedded `PIPELINE_SCHEMA` in `run_pipeline.py` from it, so the two can no longer diverge; at minimum, add a startup check that fails loudly if the embedded copy and the file on disk disagree. Add the missing properties to the schema — `seed.max_retries` and a per-module `output` string on enrich module items — so the schema actually describes the full set of keys the code reads. Either wire `clean.script_path` into `clean_stage.py` or remove it from both schemas. Fix the `repo_root` computation in `enrich_stage.py` so it resolves to the true repository root the same way `run_pipeline.py` and `seed_stage.py` do, then update the enrich module `path` values in the config to the same repo-root-relative convention used by every other path in the file. Have `seed_stage.py` pass its resolved `input_path`/`output_path` into the seed script explicitly rather than relying on the script to re-read `config["input"]`/`config["output"]` independently. Consider renaming or re-pointing `enrich.input` to a name that reflects it's raw/pre-enrichment data, and/or actually connecting the clean stage's output to the enrich stage's input if the intent is for `clean` to run before `enrich` in normal operation. For the `db019` module, either remove the config values that just restate the code's own defaults, or add a test that keeps the two in sync. Bring the hard-coded fallback paths for `outputs.metadata`/`outputs.checkpoints` in `run_pipeline.py` in line with the actual configured paths. Finally, document the `/data` mount override behaviour directly next to the `outputs` keys in the README or schema description.

---

## 5. Note

This was an investigation-only ticket; no pipeline code or configuration was changed while producing this report, per the acceptance criteria.
