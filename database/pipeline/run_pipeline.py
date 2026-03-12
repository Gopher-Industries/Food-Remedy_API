import os
import json
import time
from datetime import datetime
from typing import Optional

try:
    import yaml
    YAML_AVAILABLE = True
except Exception:
    YAML_AVAILABLE = False

try:
    import jsonschema
    JSONSCHEMA_AVAILABLE = True
except Exception:
    JSONSCHEMA_AVAILABLE = False

from .stages.clean_stage import run_clean_stage
from .stages.enrich_stage import run_enrich_stage
from .stages.seed_stage import run_seed_stage


def read_config(path: str) -> dict:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Config not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    with open(path, "r", encoding="utf-8") as f:
        if ext in (".yml", ".yaml"):
            if not YAML_AVAILABLE:
                raise RuntimeError("PyYAML required to read YAML configs")
            return yaml.safe_load(f)
        else:
            return json.load(f)


def ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)


# Minimal JSON Schema for pipeline config. A file `pipeline.config.schema.json`
# in `database/pipeline/` will be preferred if present.
PIPELINE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "pipeline": {
            "type": "object",
            "properties": {
                "fail_on_error": {"type": "boolean"},
                "outputs": {"type": "object"},
                "clean": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "input": {"type": "string"},
                        "output": {"type": "string"},
                        "script_path": {"type": "string"}
                    }
                },
                "enrich": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "input": {"type": ["string", "null"]},
                        "output": {"type": "string"},
                        "modules": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "path": {"type": "string"},
                                    "enabled": {"type": "boolean"},
                                    "config": {"type": "object"}
                                }
                            }
                        }
                    }
                },
                "seed": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "input": {"type": ["string", "null"]},
                        "script_path": {"type": "string"}
                    }
                }
            }
        }
    }
}


def _validate_config_schema(config: dict):
    if not JSONSCHEMA_AVAILABLE:
        print("jsonschema not installed: skipping pipeline config schema validation.")
        print("Install with: pip install jsonschema")
        print("Or add 'jsonschema' to requirements.txt for reproducible environments.")
        return
    # prefer schema file inside repo if present
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    schema_path = os.path.join(repo_root, "database", "pipeline", "pipeline.config.schema.json")
    schema = PIPELINE_SCHEMA
    try:
        if os.path.exists(schema_path):
            with open(schema_path, "r", encoding="utf-8") as sf:
                schema = json.load(sf)
        jsonschema.validate(instance=config, schema=schema)
    except jsonschema.ValidationError as e:
        raise ValueError(f"Pipeline config validation error: {e.message}")
    except Exception:
        # non-validation errors (file read etc.) should not block pipeline if schema missing
        pass

def runPipeline(
    config_path: Optional[str] = None,
    config: Optional[dict] = None,
    run_clean: Optional[bool] = None,
    run_enrich: Optional[bool] = None,
    run_seed: Optional[bool] = None,
    dry_run: bool = False,
    force: bool = False,
) -> dict:
    """Run the full pipeline according to a JSON/YAML config.

    Returns metadata dict about the run.
    """
    if config is None:
        if not config_path:
            raise ValueError("Either config or config_path must be provided")
        config = read_config(config_path)

    # Validate pipeline config early
    _validate_config_schema(config)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    # Default config keys
    pipeline_cfg = config.get("pipeline", {})

    # Override per-stage execution from caller/CLI if provided (tri-state None = use config)
    if run_clean is not None:
        pipeline_cfg.setdefault("clean", {})["enabled"] = bool(run_clean)
    if run_enrich is not None:
        pipeline_cfg.setdefault("enrich", {})["enabled"] = bool(run_enrich)
    if run_seed is not None:
        pipeline_cfg.setdefault("seed", {})["enabled"] = bool(run_seed)

    if dry_run:
        print("Running in DRY-RUN mode: stages should avoid writing outputs when supported")
    outputs = pipeline_cfg.get("outputs", {})
    # If a container mount /data is available and writable, prefer storing
    # metadata/checkpoints under /data/pipeline so container runs persist
    # outputs outside the image. Only override when configured outputs
    # appear to point to repo-local paths (or are empty/relative).
    data_mount_root = "/data"
    data_pipeline_dir = os.path.join(data_mount_root, "pipeline")
    try:
        if os.path.isdir(data_mount_root) and os.access(data_mount_root, os.W_OK):
            # create dir if missing
            os.makedirs(data_pipeline_dir, exist_ok=True)
            def _looks_like_repo_path(p: str) -> bool:
                if not p:
                    return True
                # relative paths or explicit 'database/pipeline' references
                if p.startswith("database" + os.sep) or p.startswith("database/"):
                    return True
                # treat non-absolute as repo-local
                if not os.path.isabs(p):
                    return True
                # absolute paths under repo root should be considered repo-local
                try:
                    abs_p = os.path.abspath(p)
                    if abs_p.startswith(repo_root):
                        return True
                except Exception:
                    pass
                return False

            meta_cfg = outputs.get("metadata", "")
            ckpt_cfg = outputs.get("checkpoints", "")
            if _looks_like_repo_path(meta_cfg):
                outputs["metadata"] = os.path.join(data_pipeline_dir, "pipeline_run_metadata.json")
            if _looks_like_repo_path(ckpt_cfg):
                outputs["checkpoints"] = os.path.join(data_pipeline_dir, "pipeline_checkpoints.json")
    except Exception:
        # Non-fatal: if we cannot create/use /data, continue using configured outputs
        pass
    stats = {
        "run_started": datetime.utcnow().isoformat(),
        "stages": {},
    }

    # checkpoint file for stage-level completion/recovery
    default_checkpoint = os.path.join(repo_root, "database", "pipeline_checkpoints.json")
    checkpoint_path = outputs.get("checkpoints", default_checkpoint)

    # load existing checkpoints if available
    checkpoints = {}
    if os.path.exists(checkpoint_path):
        try:
            with open(checkpoint_path, "r", encoding="utf-8") as cf:
                checkpoints = json.load(cf) or {}
        except Exception:
            checkpoints = {}

    # Prepare stage list for progress calculation
    configured_stages = [s for s in ("clean", "enrich", "seed") if pipeline_cfg.get(s, {}).get("enabled", True)]
    total_stages = len(configured_stages)
    completed_count = 0

    # Clean stage
    # If a checkpoint exists and the caller did not explicitly request the stage, skip it.
    if run_clean is None and checkpoints.get("clean", {}).get("status") == "completed" and not force:
        print("Skipping clean stage (already completed according to checkpoints). Use --clean to force or --force to ignore checkpoints.")
        stats["stages"]["clean"] = checkpoints.get("clean", {})
        completed_count += 1
        # brief summary from checkpoint
        ck = stats["stages"].get("clean", {})
        print(f"Clean stage: status={ck.get('status')}, processed={ck.get('result', {}).get('processed') if isinstance(ck.get('result'), dict) else None}, failures={ck.get('result', {}).get('failures') if isinstance(ck.get('result'), dict) else None}")
    elif pipeline_cfg.get("clean", {}).get("enabled", True):
        clean_cfg = pipeline_cfg.get("clean", {})
        # propagate dry-run flag into stage config so implementations can honour it
        if dry_run:
            clean_cfg["dry_run"] = True
        in_path = clean_cfg.get("input", os.path.join(repo_root, "database", "data_investigation", "exampleProductRaw.json"))
        out_path = clean_cfg.get("output", os.path.join(repo_root, "database", "data_investigation", "exampleProductCleaned.json"))
        stage_idx = completed_count + 1
        pct = int((completed_count / total_stages) * 100) if total_stages else 0
        print(f"Running stage {stage_idx}/{total_stages} (clean) — {pct}% complete")
        print(f"Running clean stage: {in_path} -> {out_path}")
        # mark running in checkpoints
        checkpoints.setdefault("clean", {})["status"] = "running"
        checkpoints["clean"]["started"] = datetime.utcnow().isoformat()
        # persist running checkpoint
        ensure_dir(checkpoint_path)
        with open(checkpoint_path, "w", encoding="utf-8") as cf:
            json.dump(checkpoints, cf, indent=2)
        try:
            res = run_clean_stage(input_path=in_path, output_path=out_path, config=clean_cfg)
            stats["stages"]["clean"] = res
            # update checkpoint as completed
            checkpoints["clean"] = {"status": "completed", "finished": datetime.utcnow().isoformat(), "result": res}
            with open(checkpoint_path, "w", encoding="utf-8") as cf:
                json.dump(checkpoints, cf, indent=2)
            completed_count += 1
            # print short summary
            print(f"Clean stage finished: processed={res.get('processed')}, failures={res.get('failures')}")
        except Exception as e:
            stats["stages"]["clean"] = {"error": str(e)}
            checkpoints["clean"] = {"status": "failed", "error": str(e), "finished": datetime.utcnow().isoformat()}
            with open(checkpoint_path, "w", encoding="utf-8") as cf:
                json.dump(checkpoints, cf, indent=2)
            if pipeline_cfg.get("fail_on_error", True):
                raise
    else:
        print("Clean stage disabled by config")

    # Enrich stage
    if run_enrich is None and checkpoints.get("enrich", {}).get("status") == "completed" and not force:
        print("Skipping enrich stage (already completed according to checkpoints). Use --enrich to force or --force to ignore checkpoints.")
        stats["stages"]["enrich"] = checkpoints.get("enrich", {})
        completed_count += 1
        ck = stats["stages"].get("enrich", {})
        res = ck.get('result') if isinstance(ck.get('result'), dict) else ck.get('result')
        print(f"Enrich stage: status={ck.get('status')}, processed={res.get('processed') if isinstance(res, dict) else None}, failures={res.get('failures') if isinstance(res, dict) else None}")
    elif pipeline_cfg.get("enrich", {}).get("enabled", True):
        enrich_cfg = pipeline_cfg.get("enrich", {})
        if dry_run:
            enrich_cfg["dry_run"] = True
        in_path = enrich_cfg.get("input", stats["stages"].get("clean", {}).get("output", None))
        out_path = enrich_cfg.get("output", os.path.join(repo_root, "database", "seeding", "products_enriched.json"))
        stage_idx = completed_count + 1
        pct = int((completed_count / total_stages) * 100) if total_stages else 0
        print(f"Running stage {stage_idx}/{total_stages} (enrich) — {pct}% complete")
        print(f"Running enrich stage: {in_path} -> {out_path}")
        checkpoints.setdefault("enrich", {})["status"] = "running"
        checkpoints["enrich"]["started"] = datetime.utcnow().isoformat()
        # persist running checkpoint
        ensure_dir(checkpoint_path)
        with open(checkpoint_path, "w", encoding="utf-8") as cf:
            json.dump(checkpoints, cf, indent=2)
        try:
            res = run_enrich_stage(input_path=in_path, output_path=out_path, config=enrich_cfg)
            stats["stages"]["enrich"] = res
            checkpoints["enrich"] = {"status": "completed", "finished": datetime.utcnow().isoformat(), "result": res}
            with open(checkpoint_path, "w", encoding="utf-8") as cf:
                json.dump(checkpoints, cf, indent=2)
            completed_count += 1
            print(f"Enrich stage finished: processed={res.get('processed')}, failures={res.get('failures')}")
        except Exception as e:
            stats["stages"]["enrich"] = {"error": str(e)}
            checkpoints["enrich"] = {"status": "failed", "error": str(e), "finished": datetime.utcnow().isoformat()}
            with open(checkpoint_path, "w", encoding="utf-8") as cf:
                json.dump(checkpoints, cf, indent=2)
            if pipeline_cfg.get("fail_on_error", True):
                raise
    else:
        print("Enrich stage disabled by config")

    # Seed stage
    if run_seed is None and checkpoints.get("seed", {}).get("status") == "completed" and not force:
        print("Skipping seed stage (already completed according to checkpoints). Use --seed to force or --force to ignore checkpoints.")
        stats["stages"]["seed"] = checkpoints.get("seed", {})
        completed_count += 1
        ck = stats["stages"].get("seed", {})
        res = ck.get('result') if isinstance(ck.get('result'), dict) else ck.get('result')
        print(f"Seed stage: status={ck.get('status')}, processed={res.get('processed') if isinstance(res, dict) else None}, failures={res.get('failures') if isinstance(res, dict) else None}")
    elif pipeline_cfg.get("seed", {}).get("enabled", True):
        seed_cfg = pipeline_cfg.get("seed", {})
        if dry_run:
            seed_cfg["dry_run"] = True
        in_path = seed_cfg.get("input", stats["stages"].get("enrich", {}).get("output", None))
        stage_idx = completed_count + 1
        pct = int((completed_count / total_stages) * 100) if total_stages else 0
        print(f"Running stage {stage_idx}/{total_stages} (seed) — {pct}% complete")
        print(f"Running seed stage with input: {in_path}")
        checkpoints.setdefault("seed", {})["status"] = "running"
        checkpoints["seed"]["started"] = datetime.utcnow().isoformat()
        # persist running checkpoint
        ensure_dir(checkpoint_path)
        with open(checkpoint_path, "w", encoding="utf-8") as cf:
            json.dump(checkpoints, cf, indent=2)
        try:
            res = run_seed_stage(input_path=in_path, config=seed_cfg)
            stats["stages"]["seed"] = res
            checkpoints["seed"] = {"status": "completed", "finished": datetime.utcnow().isoformat(), "result": res}
            with open(checkpoint_path, "w", encoding="utf-8") as cf:
                json.dump(checkpoints, cf, indent=2)
            completed_count += 1
            print(f"Seed stage finished: processed={res.get('processed')}, failures={res.get('failures')}")
        except Exception as e:
            stats["stages"]["seed"] = {"error": str(e)}
            checkpoints["seed"] = {"status": "failed", "error": str(e), "finished": datetime.utcnow().isoformat()}
            with open(checkpoint_path, "w", encoding="utf-8") as cf:
                json.dump(checkpoints, cf, indent=2)
            if pipeline_cfg.get("fail_on_error", True):
                raise
    else:
        print("Seed stage disabled by config")

    stats["run_finished"] = datetime.utcnow().isoformat()
    # Write metadata to outputs if configured
    meta_out = outputs.get("metadata", os.path.join(repo_root, "database", "pipeline_run_metadata.json"))
    ensure_dir(meta_out)
    with open(meta_out, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    print(f"Pipeline run finished. Metadata written to {meta_out}")
    return stats


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Run the data pipeline (clean -> enrich -> seed)")
    # Tri-state stage selectors: if neither flag provided, pipeline config controls execution.
    p.add_argument("-c", "--config", help="Path to pipeline config JSON/YAML")
    p.add_argument("--clean", dest="clean", action="store_true", help="Enable clean stage (overrides config)")
    p.add_argument("--no-clean", dest="clean", action="store_false", help="Disable clean stage (overrides config)")
    p.set_defaults(clean=None)

    p.add_argument("--enrich", dest="enrich", action="store_true", help="Enable enrich stage (overrides config)")
    p.add_argument("--no-enrich", dest="enrich", action="store_false", help="Disable enrich stage (overrides config)")
    p.set_defaults(enrich=None)

    p.add_argument("--seed", dest="seed", action="store_true", help="Enable seed stage (overrides config)")
    p.add_argument("--no-seed", dest="seed", action="store_false", help="Disable seed stage (overrides config)")
    p.set_defaults(seed=None)

    p.add_argument("--dry-run", dest="dry_run", action="store_true", help="Run pipeline in dry-run mode (do not write outputs if supported)")
    p.add_argument("--force", dest="force", action="store_true", help="Ignore checkpoints and force re-run of stages")

    args = p.parse_args()

    runPipeline(
        config_path=args.config,
        run_clean=args.clean,
        run_enrich=args.enrich,
        run_seed=args.seed,
        dry_run=bool(args.dry_run),
        force=bool(getattr(args, "force", False)),
    )
