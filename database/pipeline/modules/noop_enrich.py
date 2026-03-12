import os
import shutil


def run(input_path: str, output_path: str, config: dict):
    """Simple pass-through enrich module used for testing when TS script is absent.

    Copies input -> output and returns a minimal result dict.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")
    dry = False
    if config and isinstance(config, dict):
        dry = bool(config.get("dry_run"))

    if dry:
        # Count records but skip writing
        import json
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            processed = len(data)
        elif isinstance(data, dict):
            processed = len(list(data.values()))
        else:
            processed = None
        print(f"DRY-RUN: noop_enrich would copy {input_path} -> {output_path}; skipping write")
        return {"processed": processed, "failures": None, "output": None, "module": "noop_enrich"}

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    shutil.copyfile(input_path, output_path)
    return {"processed": None, "failures": None, "output": output_path, "module": "noop_enrich"}
