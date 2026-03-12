import importlib.util
import os
import shutil
import types
import json
import traceback


def import_module_from_path(path: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("_enrich_module", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_enrich_stage(input_path: str, output_path: str, config: dict) -> dict:
    """Run configured enrichment modules in sequence.

    Config format:
      {"modules": [{"name": "mod1", "path": "/abs/path/to/mod.py", "enabled": true}, ...]}

    If no modules are present, copies input -> output.
    """
    modules = config.get("modules", [])

    if not input_path:
        raise ValueError("input_path required for enrich stage")

    # If no modules, just copy
    if not modules:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        shutil.copyfile(input_path, output_path)
        return {"processed": None, "failures": None, "output": output_path, "modules_run": []}

    current_input = input_path
    run_list = []
    for m in modules:
        if not m.get("enabled", True):
            continue
        mod_path = m.get("path")
        if not mod_path:
            continue
        if not os.path.isabs(mod_path):
            # allow relative to repo root
            repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            mod_path = os.path.join(repo_root, mod_path)

        if not os.path.exists(mod_path):
            run_list.append({"module": m.get("name"), "status": "missing", "path": mod_path})
            continue

        module = import_module_from_path(mod_path)
        # Module expected to expose a function `run(input_path, output_path, config)`
        target_output = m.get("output") or output_path
        os.makedirs(os.path.dirname(target_output), exist_ok=True)
        if hasattr(module, "run"):
            try:
                result = module.run(current_input, target_output, m.get("config", {}))
                entry = {"module": m.get("name"), "status": "ok", "path": mod_path}
                if isinstance(result, dict):
                    entry["result"] = result
                # only advance input if module succeeded
                current_input = target_output
            except Exception as e:
                tb = traceback.format_exc()
                entry = {"module": m.get("name"), "status": "failed", "path": mod_path, "error": str(e), "traceback": tb}
            run_list.append(entry)
        else:
            run_list.append({"module": m.get("name"), "status": "no-run-fn", "path": mod_path})

    # Prefer counting unique records from the final output file when available.
    processed = None
    failures = None
    final_output = current_input
    try:
        if final_output and os.path.exists(final_output):
            with open(final_output, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list):
                processed = len(data)
            elif isinstance(data, dict):
                processed = len(list(data.values()))
    except Exception:
        processed = None

    # If final output wasn't available, fall back to summing module-reported counts
    if processed is None:
        total_processed = 0
        processed_found = False
        for r in run_list:
            res = r.get("result")
            if isinstance(res, dict):
                p = res.get("processed")
                if p is not None:
                    try:
                        total_processed += int(p)
                        processed_found = True
                    except Exception:
                        pass
        processed = total_processed if processed_found else None

    # Aggregate failures across modules when reported
    total_failures = 0
    failures_found = False
    for r in run_list:
        res = r.get("result")
        if isinstance(res, dict):
            f = res.get("failures")
            if f is not None:
                try:
                    total_failures += int(f)
                    failures_found = True
                except Exception:
                    pass
    failures = total_failures if failures_found else None

    return {"processed": processed, "failures": failures, "output": current_input, "modules_run": run_list}
