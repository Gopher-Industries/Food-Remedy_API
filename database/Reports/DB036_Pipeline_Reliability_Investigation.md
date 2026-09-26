# DB036 – Database Pipeline Reliability Investigation Report

**Ticket ID:** DB036
**Status:** Complete (Investigation Only — No Functional Changes)
**Author:** BHAVYA BALI
**Target Application:** Food Remedy API — Database Investigation Pipeline
**Scope:** Investigate the current database pipeline's (`clean → enrich → seed`) execution flow, identify potential failure points, review how failures are currently reported, check whether partial or incomplete output can be produced, test representative failure scenarios, and provide recommendations for reliability improvements.
**Files Reviewed:** `database/pipeline/run_pipeline.py`, `database/pipeline/pipeline.config.json`, `database/pipeline/pipeline_run_metadata.json`, `database/pipeline/stages/clean_stage.py`, `database/pipeline/stages/enrich_stage.py`, `database/pipeline/stages/seed_stage.py`, `database/pipeline/pipeline_checkpoints.json` (behaviour reviewed via live testing rather than a captured sample)

---

## 1. Executive Summary

This investigation evaluates the reliability of the Food Remedy data pipeline, which moves product data through three stages — clean, enrich, and seed — before it reaches Firestore. The pipeline behaves correctly on a normal run, but its failure handling is inconsistent across stages, and in the enrich stage specifically, a real failure can pass through as a "completed" run with no visible error.

### Key Takeaways
- **Headline Risk:** Enrich-stage module failures are caught *inside* the stage itself, so they never propagate to the orchestrator. `fail_on_error` is never consulted, and the checkpoint records the stage as `"completed"` even when a module has failed.
- **Compounding Risk:** None of the four enrich modules configured in `pipeline.config.json` specify a per-module output path, so all four write to the **same shared file**. A module that dies mid-write can corrupt that file and cause every module after it to fail too.
- **Cascading Consequence:** `seed.input` in the config is a fixed path equal to `enrich.output`, not dynamically taken from the enrich stage's actual result. A corrupted shared file is therefore read directly by the seed stage next — meaning the pipeline eventually fails loudly, but **two stages later than the real fault**, while the checkpoint still shows the enrich stage as "completed."
- **Additional Confirmed Risks:** stale checkpoints silently skip stages even after input data changes; the clean stage always reports `"failures": 0` regardless of how many malformed records it silently drops; the seed stage can discard a genuinely valid result and can mask a real bug behind a misleading error message.
- **Non-Interference:** No production pipeline code was modified for this ticket. All evidence was gathered by running the actual, unmodified stage code against constructed failure scenarios in an isolated test harness (`database/test_db036_pipeline_reliability.py`).

---

## 2. Comprehensive Investigation Findings

### 2.1 Current Pipeline Execution Flow

`run_pipeline.py` runs three stages in sequence:

1. **Clean** — normalises raw product records (optional; disabled in the current config).
2. **Enrich** — runs a configurable chain of enrichment modules (allergens, personalisation tags, mood tags, alternative-product mapping) in sequence, each module's output feeding the next.
3. **Seed** — hands the final enriched dataset to a seeding script (`seed_firestore.py`) for writing to Firestore.

Each stage's completion is recorded in `pipeline_checkpoints.json`. On a subsequent run, any stage already marked `"completed"` is skipped unless the caller passes `--force` or explicitly requests that stage. A DB018 dataset-quality report runs automatically after a successful seed stage.

### 2.2 How Enrich Module Failures Are Currently Handled

Each module in the enrich chain runs inside its own `try/except` block **within** `enrich_stage.py`. A module that raises is recorded with `"status": "failed"` in an internal `modules_run` list, but the exception is never re-raised — `run_enrich_stage()` always returns normally. This means:

- `run_pipeline.py`'s outer `try/except` around the enrich stage call never fires.
- `fail_on_error` (set to `true` in the current config) is never consulted for this case.
- The checkpoint is written as `"enrich": {"status": "completed", ...}`, with the failure visible only if someone drills into the nested `result.modules_run` array.

### 2.3 Failure Handling Behaviour Compared Across Stages

| Behaviour | Clean Stage | Enrich Stage | Seed Stage |
|---|---|---|---|
| Exception escapes on internal failure? | Yes | **No** — caught per-module inside the stage | Yes |
| `fail_on_error` respected? | Yes | **No**, for per-module failures | Yes |
| Checkpoint reflects failure accurately? | Yes | **No** — shows "completed" even with failed modules | Yes, but the surfaced error message can be misleading (see 2.7) |
| Reported failure count accurate? | **No** — hardcoded to `0` regardless of dropped records | Partial — aggregated, but easy to miss | N/A — result handling itself is fragile (see 2.7) |

### 2.4 Shared Output Path Across Enrich Modules

`enrich_stage.py` resolves each module's output as `target_output = m.get("output") or output_path`. None of the four modules in `pipeline.config.json` set an `"output"` key, so `target_output` resolves to the **same file** for every module in the chain. If a module dies partway through writing that file, it leaves a corrupted file behind — and every module scheduled after it in the chain fails too, since they read from that same broken path.

### 2.5 Checkpoint Skip Behaviour and Staleness Risk

If `run_clean`, `run_enrich`, or `run_seed` isn't explicitly passed, and the checkpoint already shows `"completed"` for that stage, the stage is skipped — with no check on whether the *input* or *config* has changed since that checkpoint was written. A stage can be silently skipped against stale input with no warning and no non-zero exit code.

### 2.6 Clean Stage Failure Reporting Gap

`run_clean_stage()` silently `continue`s past any record that isn't a `dict`, but its returned `"failures"` field is a **hardcoded `0`** — it never counts what it drops. Malformed input records vanish from the output with zero trace in the pipeline's own reporting.

### 2.7 Seed Stage Result Handling Issues

Two distinct issues in `seed_stage.py`:

- `return result or {"processed": None, ...}` treats **any falsy result** — including a genuinely valid `{}` — as if the seed script produced nothing at all.
- `except TypeError: result = module.main()` assumes a `TypeError` means "wrong number of arguments" and blindly retries with no arguments. A real bug inside `main()` that happens to raise `TypeError` for an unrelated reason (e.g. a `str + int` concatenation) gets discarded, replaced by a confusing "missing required positional argument" message that misdirects debugging.

---

## 3. Failure, Rollback & Safety Scenarios

### Scenario A: Enrich Module Fails Mid-Chain, Corrupting the Shared Output File

- **Risk:** A module crashes while writing to the shared enrich output path, leaving a truncated/corrupt file. Every module scheduled after it then fails reading that same file. The seed stage — wired to a static path equal to `enrich.output` — reads that corrupted file next.
- **Reproduced Behaviour:**

```
Module statuses: [('allergens', 'ok'), ('db009_personalisation_tags', 'failed'),
                   ('db021_mood_tags', 'failed'), ('db019_alternative_product_mapping', 'failed')]
Enrich stage 'failures' count: 3 (stage itself did NOT raise)
Shared output file on disk is CORRUPT: Unterminated string starting at: line 1 column 23 (char 22)
>>> seed stage crashes parsing the corrupted file: Unterminated string ...
```

- **Mitigation:** Give each enrich module its own intermediate output path; have `run_enrich_stage()` propagate a partial-failure status so `fail_on_error` applies consistently; wire `seed.input` from the enrich stage's actual returned output rather than a static config path.

### Scenario B: Stale Checkpoint After Input Change

- **Risk:** Rerunning the pipeline without `--force` after the input data has changed silently reuses the previous run's output.
- **Reproduced Behaviour:**

```
Records after run 1 (input had 2): 2
Input changed to 5 records on disk before run 2.
Records after run 2 (force=False):  2
```

- **Mitigation:** Have the checkpoint record a fingerprint of the resolved stage config (input path/hash, module list) and only honour a skip when the fingerprint still matches. At minimum, emit a visible warning when a stage is skipped by checkpoint.

### Scenario C: Seed Script Returns an Ambiguous or Falsy Result

- **Risk:** A seed script that returns `{}` (a valid "ran, nothing to report" result) has that result silently discarded; a script with a genuine bug that happens to raise `TypeError` has its real error message replaced by a misleading one.
- **Reproduced Behaviour:**

```
Seed script returned {}. run_seed_stage() returned:
{'processed': None, 'failures': None, 'output': 'unused.json'}

Final exception surfaced to the caller:
TypeError("main() missing 1 required positional argument: 'input_path'")
```

- **Mitigation:** Check `is None` explicitly instead of a truthy check; replace the blind retry-on-`TypeError` with an explicit signature check (`inspect.signature`) before calling `main()`, or at minimum log/chain the original exception.

---

## 4. Empirical Testing & Results

Rather than reasoning about failure modes purely from reading the source, the real, unmodified stage and orchestrator files (`run_pipeline.py`, `clean_stage.py`, `enrich_stage.py`, `seed_stage.py`) were run directly against constructed failure scenarios in an isolated sandbox mirroring the repo's package layout. Two dependencies unrelated to pipeline control flow were stubbed only so the code would import (`PipelineStageLogger`, `NutrientUnitNormalisation`) — neither affects any finding below. All quoted output above is real captured output from executing the actual code, not hypothetical.

`database/test_db036_pipeline_reliability.py` is a self-contained, additive-only script that reproduces all five scenarios. It writes its own temporary fixture files at runtime and cleans up after itself — it does not touch any existing pipeline file, config, checkpoint, or metadata.

### Reliability Test Results Summary

| Test Scenario | Expected under `fail_on_error: true` | Actual Observed Behaviour | Impact |
|---|---|---|---|
| Module fails mid-enrich chain | Stage marked failed, pipeline halts | Stage marked `"completed"`; failure buried in nested result | Silent partial enrichment |
| Input changes, rerun without `--force` | Stage re-processes new input | Stage skipped entirely; stale output retained | Output doesn't reflect current data |
| Malformed records in clean input | `failures` reflects dropped records | `failures` hardcoded to `0` | No visibility into data loss |
| Seed script returns `{}` | Result preserved | Result replaced with all-`None` fallback | Loses evidence the script ran |
| Seed script has an unrelated `TypeError` bug | Original error surfaced | Misleading "missing argument" error surfaces instead | Wrong debugging path |
| Enrich module corrupts shared output file | Isolated single-module failure | Cascades: 3 subsequent modules fail; seed stage crashes on corrupted file two stages later | Root cause hidden from failure point |

### Test Suite Verification

- `test_1_enrich_module_failure_does_not_fail_stage`: **CONFIRMED** — failure absorbed, stage returns normally
- `test_2_stale_checkpoint_causes_silent_skip`: **CONFIRMED** — stage skipped despite changed input
- `test_3_clean_stage_hardcoded_failures`: **CONFIRMED** — `failures` always `0`
- `test_4_seed_stage_result_handling`: **CONFIRMED** — falsy-result bug and misleading `TypeError` retry both reproduced
- `test_5_cascading_shared_output_corruption`: **CONFIRMED** — corruption cascades from enrich into the seed stage

All five scenarios were reproduced cleanly against the real, unmodified pipeline code.

---

## 5. Implementation Recommendations

1. **Fix Enrich-Stage Failure Propagation and Output Isolation:**
   - Give each enrich module its own intermediate output path instead of sharing one file.
   - Have `run_enrich_stage()` surface a partial-failure status so `fail_on_error` applies consistently to module failures, not just stage-level exceptions.
   - Wire `seed.input` from the enrich stage's actual returned output rather than a static config path.
2. **Make Checkpoints Config-Aware:**
   - Record a fingerprint of the resolved stage config (input path/hash, module list) in the checkpoint, and only skip a stage when that fingerprint still matches.
   - Emit a visible warning when a stage is skipped by checkpoint, not just an internal log call.
3. **Fix Clean-Stage Failure Counting:** Count records skipped by the `isinstance(record, dict)` check and report them in `"failures"` instead of hardcoding `0`.
4. **Harden Seed-Stage Result Handling:** Replace the truthy `result or {...}` check with an explicit `is None` check; replace the blind `except TypeError` retry with a signature check via `inspect.signature`, or at minimum chain the original exception so it isn't lost.
5. **Improve Write Durability and Auditability:** Write `pipeline_checkpoints.json` and `pipeline_run_metadata.json` atomically (temp file + `os.replace()`); retain run history rather than fully overwriting metadata each run; make `jsonschema` a hard dependency and route the "schema validation skipped" message through `pipeline_logger` instead of `print()`.

---

*Report prepared for DB036 ticket completion.*
