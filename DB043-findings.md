# DB043 – Investigate Pipeline File Path & Output Consistency

## Files Reviewed
- database/pipeline/pipeline.config.json
- database/pipeline/run_pipeline.py
- database/pipeline/stages/clean_stage.py
- database/pipeline/stages/enrich_stage.py
- database/pipeline/stages/seed_stage.py
- database/seeding/seed_firestore.py

## Data Flow Overview
- **clean stage (currently disabled)**: database/data_investigation/exampleProductRaw.json -> database/data_investigation/exampleProductCleaned.json
- **enrich stage**: database/seeding/products_5k_enriched.json -> database/seeding/products_enriched.json (runs 4 modules in sequence: allergens, db009_personalisation_tags, db021_mood_tags, db019_alternative_product_mapping)
- **seed stage**: database/seeding/products_enriched.json -> database/seeding/seeded_products.json (writes to Firestore via seed_firestore.py)
- enrich -> seed handoff is correctly connected (enrich's declared output is exactly what seed reads as input)
- clean stage is NOT connected to enrich stage — separate folders, no shared path, output never consumed downstream

## Duplicate / Unclear / Outdated Paths

### Config-level
- clean stage is disconnected from enrich/seed — output never consumed downstream, lives in a different folder (`data_investigation/`) than the rest of the pipeline (`seeding/`)
- input file `products_5k_enriched.json` is confusingly named for an INPUT file (name implies it's already enriched)
- several similar-looking filenames sit in the same folder, easy to confuse: `products_5k_enriched.json`, `products_enriched.json`, `seeded_products.json`, `product_alternatives_index.json`
- db019 module's `sidecar_index_path` is effectively an output file, but declared inside nested module config rather than at stage level like other outputs
- `ts_enrich_wrapper` module (disabled) references a `.ts` file under `mobile-app/services/nutrition/`, outside the database folder — likely outdated/legacy

### run_pipeline.py
- checkpoint path mismatch: config specifies `database/pipeline/pipeline_checkpoints.json`, code's fallback default is `database/pipeline_checkpoints.json` (missing `pipeline/` folder)
- dead fallback logic in the enrich stage call suggests clean was originally meant to feed directly into enrich — no longer true given current config
- DB018 quality report's output path is hardcoded in this file, unlike every other output path which lives in the config
- `/data` mount override silently redirects metadata/checkpoint outputs in containerized, non-Windows environments — not reflected in the config file
- seed stage's output path is handled differently from clean/enrich: those two have output explicitly computed and passed in, seed's is left for the invoked script to manage
- leftover commented-out "DB031 test" exception — dead debug code

### clean_stage.py
- manual `sys.path` workaround to import from `database/clean_data/normalization/`, with its own TODO admitting it's temporary
- two differently-named "cleaning-related" folders: `database/data_investigation/` (config paths) vs `database/clean_data/normalization/` (helper import) — confusing overlap
- logs `"[DB018]"` on cleaning completion, but DB018 is actually the dataset-quality-report ticket elsewhere in the pipeline — mismatched label

### enrich_stage.py
- no enrich module defines its own `"output"` in config, so all 4 enabled modules read/write the same shared `output_path` sequentially — no separate intermediate file per module
- `repo_root` computed differently than in `run_pipeline.py` (one folder deeper due to this file's location), landing on `database/` instead of true repo root — only "works" because config module `"path"` entries omit the `database/` prefix used everywhere else
- inconsistent path convention within the same `enrich.modules` config block: top-level module `"path"` fields omit `database/` prefix, nested fields like db019's `sidecar_index_path` include it
- `compute_product_health_score()` appears unused/dead — imports a `nutrition_enrich` (DB010) module not listed in the config's `modules` array at all

### seed_stage.py
- contains a `"FIXED: correct repo root"` comment using 3 levels of `".."`, at the same folder depth where `enrich_stage.py` incorrectly uses only 2 — confirms this exact bug was previously encountered and fixed here, but never applied to enrich_stage.py
- docstring states default script is `seed_products.py`, but actual configured `script_path` is `seed_firestore.py` — documented default doesn't match real usage
- never reads `config["output"]` directly — relies entirely on the invoked script to manage its own output path

### seed_firestore.py
- `seed_products()` entry point ignores the `input_path` argument passed through the call chain (`run_pipeline.py` → `seed_stage.py`) entirely, re-deriving the input path independently from `config["input"]` — two parallel, silently duplicate paths to the same value, only one of which is actually used
- a second, separate checkpoint file exists here (`checkpoint.json`, for Firestore batch-write resume) distinct from the pipeline-level `pipeline_checkpoints.json` — similar naming, different purpose/location
- `serviceAccountKey.json` credential file is searched for in 3 different possible locations (cwd, repo root, BASE_DIR) with first match silently winning
- defines its own path-resolution helpers (`_resolve_repo_path`, `_repo_relative_for_metadata`) not shared with any other stage file, each of which handles path logic differently inline
- inconsistent default-path style in the same `argparse` block: `--input` default built via `os.path.join(BASE_DIR, ...)`, `--output` default is a hardcoded literal string
- `REPO_ROOT` here is calculated correctly (2 levels up from `database/seeding/`), further confirming `enrich_stage.py` is the outlier with the repo-root bug

## Traced Example Flow
database/seeding/products_5k_enriched.json
-> enrich stage (allergens, db009, db021, db019 modules run in sequence) ->
database/seeding/products_enriched.json
-> seed stage (seed_firestore.py) ->
database/seeding/seeded_products.json
(+ Firestore "products" collection)


## Recommendations
1. **Fix the repo root path in `enrich_stage.py`**: The file currently uses two `".."` levels to reach the repo root, but it actually needs three. This is already handled correctly in `seed_stage.py`. It works at the moment because of the current module path configuration, but it could cause problems if the configuration changes later.

2. **Make the paths in `pipeline.config.json` consistent**: At the moment, some paths include the `database/` prefix while others do not. We should choose one approach and use it consistently throughout the configuration.

3. **Check the checkpoint path in `run_pipeline.py`**: The fallback path in the code does not match the path currently configured (`pipeline/pipeline_checkpoints.json`). These should be checked and made consistent.

4. **Clarify the role of the `clean` stage**: The `clean` stage currently does not feed its output into the `enrich` stage. We should either connect it properly to the main pipeline or clearly document it as a separate or standalone utility.

5. **Remove duplicate input path logic in `seed_firestore.py`**: `seed_products()` already receives an `input_path`, so it should use that value instead of calculating the input path again from the configuration. This will make the function clearer and avoid unexpected behaviour.

6. **Move the DB018 report output path into the configuration**: The output path is currently defined directly in the DB018 code. It would be more consistent to keep it in `pipeline.config.json`, like the other output paths.

7. **Rename `products_5k_enriched.json`**: The filename suggests that the file already contains enriched data, which can be confusing when there is also a `products_enriched.json` file. A name such as `products_5k_raw.json` would make its purpose clearer.

8. **Clean up unused or outdated code**: Remove the commented out DB031 test exception in `run_pipeline.py` and the unused `compute_product_health_score()` function in `enrich_stage.py`. Also, check whether `seed_products.py`, which is mentioned in the `seed_stage.py` docstring, still exists. If not, the documentation should be updated.

9. **Fix the `[DB018]` label in `clean_stage.py`**: The log message currently uses the `[DB018]` label, which may be misleading because it does not appear to relate to the actual DB018 ticket. The label should be corrected to avoid confusion when reviewing logs.

10. **Consider creating a shared path resolution utility**: Different stage files currently handle paths in slightly different ways. Creating one shared utility for resolving paths would make the code more consistent and reduce the chance of path related bugs.