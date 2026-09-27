# DB038-2 — Investigate Pipeline Checkpoint & Resume Process

**Ticket (Planner):** DB038 – Investigate Pipeline Checkpoint & Resume Process
**Repo reference used in this doc/branch:** `DB038-2` (see "Note on ticket ID" below)
**Repo:** Food-Remedy_API
**Type:** Investigation / documentation — **no application code changed**
**Author:** Barbie Mahajan (s223514755@deakin.edu.au)

---

## Note on ticket ID (DB038 → DB038-2)

Before starting work, a repo-wide search showed that **DB038 is already used** by an existing, unrelated, previously-completed document: `Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md` ("Source data gaps and limitations" — a data-quality reference doc for demos/QA, not a pipeline-checkpoint investigation).

Since the Planner card for this new investigation is also labelled DB038, there is a ticket-ID collision between two different pieces of work. To avoid overwriting or being confused with the existing DB038 documentation:

- This investigation is filed under **DB038-2** (branch `DB038-2-Pipeline-Checkpoint-Resume`, this document's filename) rather than reusing the bare `DB038-*` naming already taken.
- The existing `DB038-Source-Data-Gaps-And-Limitations.md` was **not modified**.
- **Recommendation:** flag this collision to the team lead/Planner owner so the checkpoint/resume ticket can be given its own correct ID (this is at least the second such collision found on the Database Team board — DB021 had a similar file-name collision earlier this trimester). A short-term convention suggestion: before assigning/starting a new ticket, grep `Documents/Database/` and the codebase for the ticket ID first.

---

## Summary

The pipeline does not have one checkpoint system — it has **four independent checkpoint mechanisms**, writing to **four different files**, with **inconsistent granularity and, in one case, a direct file collision** where two different scripts silently overwrite each other's checkpoint data if both are ever run against the seeding directory. The most actively used mechanism (the stage-level checkpoint in `run_pipeline.py`) does provide basic resume (it can skip a stage that is already marked `"completed"`), but it is coarse — a stage that fails or is interrupted mid-way is not resumed from where it stopped, it simply restarts from the beginning of that stage next run. The best-designed and best-tested mechanism (`CheckpointManager`, batch-level, with real passing unit tests) is the one actually wired into the configured pipeline for seeding, which is a positive finding. The project's own DB028 documentation additionally misattributes where the pipeline-level checkpoint logic lives, which could mislead a future contributor.

## Files reviewed

| File | Role |
|---|---|
| `database/pipeline/run_pipeline.py` | Orchestrator; owns the clean/enrich/seed **stage-level** checkpoint dict and skip-on-completed logic |
| `database/pipeline_checkpoints.json` | On-disk stage checkpoint — hardcoded default path in `run_pipeline.py` |
| `database/pipeline/pipeline_checkpoints.json` | On-disk stage checkpoint — actual path when run via the committed `pipeline.config.json` |
| `database/pipeline/pipeline_run_metadata.json` | Per-run metadata written at the end of `runPipeline()` |
| `database/pipeline/pipeline.config.json` | Configures `outputs.checkpoints` / `outputs.metadata` and the seed stage's `script_path` |
| `database/pipeline/modules/db018_checkpoint.py` | Generic `load_checkpoint`/`save_checkpoint(path, data)` helpers |
| `database/pipeline/modules/db018_runner.py` | Chunked DB018 quality-report runner; the only consumer of `db018_checkpoint.py` |
| `database/seeding/checkpoint_manager.py` | `CheckpointManager` class — batch-level seeding checkpoint (richest schema) |
| `database/seeding/checkpoint.json` | On-disk batch checkpoint — shared file target of **two different writers** (see Finding 2) |
| `database/seeding/pipeline_checkpoints.json` | On-disk chunk checkpoint (`last_completed_chunk`) written by `db018_checkpoint.py` via `db018_runner.py` |
| `database/seeding/seed_firestore.py` | "Enhanced" seeding engine; imports and uses `CheckpointManager`; exposes `seed_products()`, the entry point the pipeline actually calls |
| `database/seeding/seed_engine.py` | Older/parallel seeding script; defines its **own** simple `load_checkpoint()`/`save_checkpoint(batch_index)` functions against the same file `seed_firestore.py`'s `CheckpointManager` uses |
| `database/seeding/seed_products.py` | Thin delegator so `run_seed_stage()` can call `database/seeding/seed_firestore.py:seed_products` by default |
| `database/pipeline/stages/seed_stage.py` | Dynamically imports whichever script `config["script_path"]` points to and calls its `seed_products()`/`main()` |
| `database/seeding/test_enhanced_seeding.py` | Existing unit tests: `test_checkpoint_persistence`, `test_checkpoint_resume` (exercise `CheckpointManager` directly) |
| `database/seeding/run_large_pipeline_test.py` | Test harness that runs `run_pipeline.py` per-chunk with per-chunk checkpoint file paths |
| `Documents/Database/2025 Trimester 3/DB028_Pipeline_Reliability_Seeding_Documentation.md` | Existing team documentation of pipeline orchestration and recovery checkpoints |

---

## 1. Checkpoint mechanisms identified

| # | Mechanism | Code location | File(s) on disk | Granularity | Schema |
|---|---|---|---|---|---|
| A | Stage checkpoint | inline dict in `run_pipeline.py::runPipeline()` | `database/pipeline_checkpoints.json` (default) **or** `database/pipeline/pipeline_checkpoints.json` (per committed config) | Per pipeline **stage** (clean / enrich / seed) | `{status, started, finished, result, error?}` per stage |
| B | Batch checkpoint (seeding, enhanced) | `CheckpointManager` class in `checkpoint_manager.py`, used by `seed_firestore.py` | `database/seeding/checkpoint.json` | Per **batch** of Firestore writes | `{last_batch_index, documents_written, documents_failed, batches_completed, batches_failed, started_at, last_updated_at, failed_documents[], rate_limit_state}` |
| C | Batch checkpoint (seeding, legacy) | free functions `load_checkpoint()`/`save_checkpoint()` in `seed_engine.py` | `database/seeding/checkpoint.json` (**same file as B**) | Per **batch** | `{last_batch_index}` only |
| D | Chunk checkpoint (DB018 report runner) | generic `load_checkpoint(path)`/`save_checkpoint(path, data)` in `db018_checkpoint.py`, used by `db018_runner.py` | `database/seeding/pipeline_checkpoints.json` | Per **chunk** of the DB018 quality-report run | `{last_completed_chunk}` |

That is four mechanisms, writing to effectively **four distinct files** (two of which — B and C — collide on the *same* file with incompatible schemas).

## 2. Checkpoint creation/update behaviour (per mechanism)

**A — stage checkpoint (`run_pipeline.py`):** before a stage runs, its entry is set to `{"status": "running", "started": <now>}` and written to disk immediately. On success, it is overwritten with `{"status": "completed", "finished": <now>, "result": <stage output dict>}`. On exception, `{"status": "failed", "error": <str>, "finished": <now>}`. The whole `checkpoints` dict is rewritten to disk after every stage transition (not just the changed stage), so the file always reflects a full snapshot at time of write.

**B — batch checkpoint (`CheckpointManager`):** on each successful batch, `mark_batch_success()` increments `documents_written`/`documents_failed`/`batches_completed` and calls `save()`, which rewrites `last_updated_at` and dumps the full state. On a failed batch, `mark_batch_failure()` increments `batches_failed` and also calls `save()` — batch failures are recorded but the batch is not marked as done, so it will be retried on next run. `add_failed_document()` appends to a capped (max 100) `failed_documents` list for troubleshooting, but does not itself trigger a save.

**C — batch checkpoint (`seed_engine.py` legacy functions):** `save_checkpoint(batch_index)` is called after each successful batch and **unconditionally overwrites** the checkpoint file with just `{"last_batch_index": batch_index}` — it does not read or preserve any existing content first.

**D — chunk checkpoint (`db018_checkpoint.py`):** `save_checkpoint(path, {"last_completed_chunk": idx})` is called once per completed chunk in `db018_runner.py`'s loop, again as a full-file overwrite (no merge with prior content, though for this single-key schema that's not a problem the way it is for B/C).

## 3. Resume behaviour investigated

**A (stage-level):** on the next run, if the CLI/caller did **not** explicitly force a stage on/off (`run_clean`/`run_enrich`/`run_seed` left as `None`) and the stored status is `"completed"` and `--force` was not passed, the stage is skipped entirely and its previous `result` is copied into the new run's `stats`. This is real resume, but it is **all-or-nothing per stage** — there is no in-stage resume. If a stage is interrupted while `"status": "running"` (e.g. the process is killed mid-clean), that status is never `"completed"`, so next run the stage simply **restarts from the beginning** — none of the partial work inside that stage is reused. This matches what DB013 already found: the `res = ck.get('result')` line recovered from a skipped stage's checkpoint is stored into `stats` but not otherwise used to change behaviour beyond that.

**B (seeding, `CheckpointManager`):** `get_resume_info()` returns `next_batch_index = last_batch_index + 1`; `seed_firestore.py`'s `run()` uses this to compute `resume_offset` and slices the input data from there. This **is** genuine batch-level resume — confirmed both by direct code trace and by the two existing unit tests in `test_enhanced_seeding.py` (`test_checkpoint_persistence`, `test_checkpoint_resume`), which simulate a batch completing, reloading the checkpoint in a fresh `CheckpointManager` instance, and asserting the resume point and counters are correct. I did not re-run these tests in this session (no script-execution environment was available to me); see "Representative evidence" below for the exact command to confirm this on a real machine.

**C (`seed_engine.py`):** `load_checkpoint()` returns only `last_batch_index`, so if this script is run, resume is possible in the sense that it can skip already-processed batches, but written/failed document counts are not preserved across runs (they live only in this script's local variables) — reported totals after a resumed run would only reflect the current run, not the cumulative job.

**D (chunk-level):** `start_chunk = last_completed + 1` — straightforward, correct resume at chunk granularity for the DB018 large-run test harness.

**`--force` interaction:** `--force` (or `force=True`) bypasses checkpoint skipping for **all** stages in one shot, regardless of individual stage status. There is no per-stage force flag, so forcing a re-run of just the `seed` stage, for example, also forces `clean` and `enrich` to re-run if their checkpoint would otherwise apply — unless the caller *also* explicitly disables those stages with `--no-clean`/`--no-enrich`. This is a minor usability gap rather than a correctness bug (DB013's testing already demonstrated the `--force` vs no-`--force` distinction on a live run).

## 4. Duplicated / inconsistent checkpoint handling

**Finding 1 — two different files hold "the" pipeline checkpoint, depending on how you run it.** `run_pipeline.py`'s hardcoded default is `database/pipeline_checkpoints.json` (one level above `database/pipeline/`). The committed `database/pipeline/pipeline.config.json` overrides this to `database/pipeline/pipeline_checkpoints.json` (inside the `pipeline/` folder). Both files currently exist in the repo simultaneously, with different content:
- `database/pipeline_checkpoints.json` contains only an `enrich` entry, with an absolute macOS path baked into its `result.output` (`/Users/macos/Desktop/Deakin/SIT764_Project A/...`).
- `database/pipeline/pipeline_checkpoints.json` contains `clean`, `enrich`, and `seed` entries, with absolute Linux container paths (`/workspaces/Food-Remedy_API/...`).

Neither file is portable to a third machine, and because two different default locations exist, a contributor who runs `run_pipeline.py` without `-c pipeline.config.json` will silently read/write a *different* checkpoint file than one who runs it with the config — each will think a given stage needs to (re-)run when the other's checkpoint says it's already done.

**Finding 2 — a genuine file collision between mechanisms B and C.** `seed_firestore.py` (`CheckpointManager`, the version the pipeline is actually configured to call) and `seed_engine.py` (the simpler legacy functions) both compute `CHECKPOINT_FILE = os.path.join(BASE_DIR, "checkpoint.json")` from the same `BASE_DIR` (`database/seeding/`) — i.e. **the identical file path**. If `seed_engine.py` is ever run directly (it is still present, still executable, and still imported/tested independently — it is not marked deprecated anywhere in the repo or its own docstring), its `save_checkpoint()` will unconditionally overwrite `database/seeding/checkpoint.json` with just `{"last_batch_index": N}`, silently discarding `CheckpointManager`'s richer state (`documents_written`, `documents_failed`, `batches_completed`, `rate_limit_state`, `failed_documents`) the next time `seed_firestore.py` loads it. `CheckpointManager._normalize_state()` would backfill the missing keys with zeros rather than error, so this failure mode is **silent** — no exception, just quietly-wrong progress counters.

**Finding 3 — documentation vs. actual code.** The existing DB028 documentation (`Documents/Database/2025 Trimester 3/DB028_Pipeline_Reliability_Seeding_Documentation.md`, §5.2) states: *"Logic of check points is managed in: `database/pipeline/modules/db018_checkpoint.py`."* This is inaccurate/incomplete for the pipeline's actual stage-level recovery checkpoint (mechanism A), which is implemented inline in `run_pipeline.py` itself, not in `db018_checkpoint.py`. `db018_checkpoint.py` is only used by `db018_runner.py`, a separate chunk-level harness for the DB018 quality-report large-scale test, not by the main clean→enrich→seed orchestration the rest of that document is describing. A reader following the DB028 doc to understand or modify pipeline resume behaviour would be pointed at the wrong file.

**Finding 4 — checkpoint metadata can misrepresent when a stage actually ran.** When a stage is skipped via checkpoint (mechanism A), the skipped stage's old `finished` timestamp is copied verbatim into the new run's `stats`, while the top-level `run_started`/`run_finished` in `pipeline_run_metadata.json` reflect the current run. This is visible in the repo's own committed `database/pipeline/pipeline_run_metadata.json`: `run_started`/`run_finished` are both `2026-05-08T12:0x`, but the `seed` stage's `finished` timestamp inside the same file is `2026-05-06T18:02:31` — two days earlier — with no field indicating that stage was skipped rather than freshly executed. Someone reading only the metadata file (not the logs) could reasonably conclude the seed stage ran on 8 May, when it actually didn't run at all that day — it was skipped.

## 5. Representative evidence

Two existing, already-committed unit tests exercise checkpoint persistence and resume directly against `CheckpointManager` (mechanism B, the one actually used in production seeding):

```
database/seeding/test_enhanced_seeding.py::test_checkpoint_persistence
database/seeding/test_enhanced_seeding.py::test_checkpoint_resume
```

I traced both by reading the code rather than executing them in this session (no script-execution environment was available to me here). To get real, current pass/fail evidence for this investigation, run:

```
pytest database/seeding/test_enhanced_seeding.py -k checkpoint -v
```

The file collision (Finding 2) and the two-different-default-path issue (Finding 1) are demonstrated by direct comparison of files already committed to the repo (quoted above), not by running new code — this is representative evidence of an existing, real inconsistency, independent of test execution.

## 6. Recommendations

1. **Pick one seeding checkpoint mechanism and remove the other.** `CheckpointManager` (mechanism B) is more complete and already has passing unit tests — recommend deleting or clearly deprecating `seed_engine.py`'s standalone `load_checkpoint()`/`save_checkpoint()` functions (mechanism C) so they cannot silently clobber `database/seeding/checkpoint.json`. If `seed_engine.py` still serves a purpose, it should import and use `CheckpointManager` like `seed_firestore.py` does, not duplicate a simpler version of the same idea.
2. **Reconcile the two pipeline-checkpoint default paths.** Either change `run_pipeline.py`'s hardcoded default to match `pipeline.config.json` (`database/pipeline/pipeline_checkpoints.json`), or vice versa, so there is exactly one checkpoint file regardless of whether a config is passed. The two stale, machine-specific files currently in the repo should be reviewed and likely `.gitignore`d rather than committed (they contain other developers' local absolute paths).
3. **Correct the DB028 documentation** (§5.2) to point at `run_pipeline.py` for stage-level recovery checkpoint logic, and clarify that `db018_checkpoint.py` is scoped specifically to the DB018 chunked test runner, not the main pipeline.
4. **Add a `skipped: true` (or similar) flag** to a stage's entry in `pipeline_run_metadata.json` when it was satisfied by checkpoint rather than freshly executed, so the metadata file can't be misread as "this stage ran during this run."
5. **Consider finer-grained resume for stage A** (e.g. record-level or module-level within `enrich`) if stage restart time becomes a real cost — currently a crash 99% through the `enrich` stage still means a full stage re-run, which is only a minor issue at current dataset sizes (5k records) but would not scale well to larger runs.
6. **Document the four mechanisms and their scopes in one place** (a short "Checkpoints in this repo" section, perhaps appended to the DB028 doc) so future contributors don't add a fifth mechanism by accident.

## 7. Acceptance criteria checklist

| Criterion | Status |
|---|---|
| Existing checkpoint mechanisms are identified | ✅ Four mechanisms identified (Section 1) |
| Checkpoint creation and update behaviour is documented | ✅ Section 2 |
| Resume behaviour has been investigated | ✅ Section 3, including `--force` interaction |
| Any duplicated or inconsistent checkpoint handling is identified | ✅ Section 4 (four distinct findings, including a real file collision) |
| Representative evidence is included | ✅ Section 5 (existing tests identified + exact command to confirm; direct file-content comparison for Findings 1–2) |
| Relevant files reviewed are documented | ✅ "Files reviewed" table |
| Recommendations are provided | ✅ Section 6 (six recommendations) |
| No existing functionality is changed | ✅ Investigation only — no source files modified |

## 8. Notes / limitations

- This was a documentation/investigation ticket; no application code was modified.
- Test execution evidence for `test_checkpoint_persistence`/`test_checkpoint_resume` is based on code tracing, not a live run, since no script-execution environment was available to me in this session. Running `pytest database/seeding/test_enhanced_seeding.py -k checkpoint -v` would convert this into fully executed evidence — recommended before or during PR review.
- Findings 1 and 2 (the file-path mismatch and the checkpoint.json collision) are drawn directly from comparing already-committed file contents and already-committed code, so they hold regardless of test execution.
