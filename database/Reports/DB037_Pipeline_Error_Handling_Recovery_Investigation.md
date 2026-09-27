# DB037 – Investigate Pipeline Error Handling & Recovery Investigation Report

**Ticket ID:** DB037  
**Status:** Complete (Investigation Only)  
**Author:** ANJUM ASIYA  
**Target Application:** Food Remedy API / Database Pipeline Orchestration  
**Scope:** Investigation into exception handling, stage failure behavior, error reporting, and restart/recovery mechanics across `run_pipeline.py`, pipeline stages (`clean`, `enrich`, `seed`), and enrichment modules.

---

## 1. Executive Summary

This investigation audits how errors and exceptions are trapped, logged, and handled during database pipeline execution (`Clean -> Enrich -> Seed`), and evaluates whether the pipeline can safely recover and restart after a stage or module failure.

### Key Takeaways
- **Stage-Level Error Handling:** Top-level stage execution in `run_pipeline.py` is wrapped in structured `try...except` blocks. On uncaught stage exceptions, the checkpoint status is set to `"failed"`, and execution halts if `fail_on_error` is `True` (default).
- **Enrichment Module Error Masking:** `run_enrich_stage()` catches module-level exceptions internally. While module errors are recorded in `modules_run` with `status: "failed"`, `run_enrich_stage()` returns normally without raising an exception to `run_pipeline.py`. As a result, `run_pipeline.py` marks the overall enrich stage as `"completed"` in checkpoints even when a sub-module crashes.
- **Restart & Recovery Mechanics:** Failed stages can be restarted using `run_pipeline.py`. Completed stages are skipped based on `pipeline_checkpoints.json`. Passing `--force` allows developers to bypass stale checkpoints and re-execute all stages cleanly.
- **Empirical Testing:** Added unit test suite `database/test_db037_pipeline_error_handling.py` (4/4 tests passing) reproducing stage failure, `fail_on_error` enforcement, module exception trapping, and `--force` recovery.
- **Non-Interference:** This ticket is investigation-only; no existing source code, pipeline logic, or configuration schemas were altered.

---

## 2. Review of Existing Error Handling Architecture

The pipeline error handling operates across three distinct layers:

```
[Level 1: Pipeline Orchestrator] (run_pipeline.py)
   ├── Enforces fail_on_error flag
   └── Writes checkpoint status ("running" / "completed" / "failed")
        │
[Level 2: Stage Executors] (clean_stage.py / enrich_stage.py / seed_stage.py)
   ├── Processes record batches
   └── Catches/formats stage-level exceptions
        │
[Level 3: Enrichment Sub-Modules] (allergens_enrich.py, db009, db021, etc.)
   └── Executed in sequence by enrich_stage.py (trapped locally per module)
```

### Layer-by-Layer Behavior

1. **Orchestrator Level (`run_pipeline.py`):**
   - Each stage execution is wrapped in a `try...except Exception as e:` block.
   - On error, `PipelineStageLogger.log_stage_error()` writes structured error details to standard logs.
   - The runner writes a JSON checkpoint update:
     ```json
     {
       "clean": {
         "status": "failed",
         "error": "FileNotFoundError: [Errno 2] No such file or directory...",
         "finished": "2026-09-02T03:15:00Z"
       }
     }
     ```
   - If `pipeline.fail_on_error` is `True`, `raise` is called, terminating the pipeline immediately.

2. **Stage Executor Level (`clean_stage.py`, `seed_stage.py`):**
   - Input file presence and JSON structure are validated upon stage start. Unhandled file I/O or syntax errors bubble up directly to Level 1.

3. **Enrichment Module Level (`enrich_stage.py`):**
   - Modules listed under `pipeline.enrich.modules` are loaded dynamically via `importlib`.
   - Each module's `run()` function is invoked inside a local `try...except` block:
     ```python
     try:
         result = module.run(current_input, target_output, m.get("config", {}))
         current_input = target_output
     except Exception as e:
         tb = traceback.format_exc()
         entry = {"module": m.get("name"), "status": "failed", "error": str(e), "traceback": tb}
     ```
   - **Key Finding:** Module exceptions **do not stop later modules from executing**, nor do they cause `run_enrich_stage()` to raise an exception. The failure count is incremented in the return dict, but Level 1 receives a normal return value.

---

## 3. Pipeline Failure & Stopping Behavior

| Failure Scenario | Processing Halts? | Checkpoint Status Recorded | Risk & Downstream Impact |
| :--- | :---: | :---: | :--- |
| **Missing Input File (Clean Stage)** | **Yes** (if `fail_on_error: true`) | `"clean": {"status": "failed"}` | Safe: execution stops immediately; no output generated. |
| **Enrich Module Crash (e.g. Allergens)** | **No** (Continues to next module) | **`"enrich": {"status": "completed"}`** | **High Risk:** The runner treats enrich stage as successful despite module failure, causing incomplete data to enter the seed stage. |
| **Firestore Credentials Missing (Seed Stage)** | **Yes** | `"seed": {"status": "failed"}` | Safe: Firestore seeding halts; `failed_documents` logged to checkpoint file. |
| **Invalid JSON Input** | **Yes** | `"failed"` on affected stage | Safe: JSON decoding exception stops stage execution cleanly. |

---

## 4. Recovery Mechanics & Restart Analysis

### 1. Resuming After Failure (Default Behavior)
When `run_pipeline.py` is invoked after a failure:
- The runner loads `pipeline_checkpoints.json`.
- Stages marked `"completed"` are **skipped**.
- Stages marked `"failed"` or `"running"` are **re-executed**.

### 2. Forced Re-Execution (`--force` flag)
Running with `--force`:
```bash
python -m database.pipeline.run_pipeline -c database/pipeline/pipeline.config.json --force
```
Ignores all existing checkpoint statuses and forces every enabled stage to re-run from raw source data.

### 3. Identified Risks When Restarting Failed Runs
- **Risk 1 (Stale Intermediate Outputs):** If an enrichment module crashes halfway through writing a shared output JSON, restarting the pipeline without `--force` or clean input re-generation can feed corrupt JSON to downstream stages.
- **Risk 2 (Undetected Input Data Changes):** Checkpoints do not hash input file contents. If source JSON data is updated after a failure, resuming without `--force` skips earlier stages and processes old intermediate data.

---

## 5. Empirical Test Suite Summary

A dedicated test suite was created in `database/test_db037_pipeline_error_handling.py` to empirically verify error handling and recovery:

```bash
pytest database/test_db037_pipeline_error_handling.py -v
```

### Test Coverage Results
- `test_clean_stage_missing_input_file_raises`: Verifies `FileNotFoundError` handling in clean stage. (**PASSED**)
- `test_enrich_stage_captures_module_exceptions`: Verifies module exception trapping and status recording in `enrich_stage.py`. (**PASSED**)
- `test_pipeline_fail_on_error_behavior`: Verifies `fail_on_error` flag behavior and checkpoint `"failed"` state creation. (**PASSED**)
- `test_pipeline_recovery_with_force_flag`: Verifies clean stage re-execution when `--force` is passed over an existing completed checkpoint. (**PASSED**)

All **4/4 tests passed** cleanly.

---

## 6. Reviewed Files

- `database/pipeline/run_pipeline.py` (Pipeline orchestrator & error handler)
- `database/pipeline/stages/clean_stage.py` (Clean stage executor)
- `database/pipeline/stages/enrich_stage.py` (Enrich stage module runner)
- `database/pipeline/stages/seed_stage.py` (Seed stage executor)
- `database/logging_system/pipeline_logger.py` (Structured pipeline logger)
- `database/pipeline/pipeline_run_metadata.json` (Run metadata output)
- `database/pipeline/pipeline_checkpoints.json` (Stage checkpoint state file)
- `database/test_db037_pipeline_error_handling.py` (Additive unit test suite)

---

## 7. Actionable Recommendations

1. **Raise Exception on Module Failures in Enrich Stage:** Update `run_enrich_stage()` to raise an exception if `failed_module_count > 0` and `fail_on_error` is `True`, ensuring checkpoints correctly record `"enrich": {"status": "failed"}`.
2. **Isolate Module Output Files:** Configure each enrichment module to write to a distinct intermediate file (e.g. `products_allergens.json`) rather than mutating a single shared output file (`products_enriched.json`).
3. **Add Input Data Fingerprinting to Checkpoints:** Include an MD5 checksum of input files inside `pipeline_checkpoints.json` so that changes to source data automatically invalidate stale checkpoints.

---

*Report prepared for DB037 ticket completion.*
