import os
import subprocess
import shutil
import json
from typing import Optional


def run(input_path: str, output_path: str, config: dict):
    """Run the TypeScript enrichment script as a subprocess.

    Expects the TS script `enrichProducts.ts` to accept two args: <input.json> <output.json>

    The config may include `ts_path` (path to the .ts file). If absent, the wrapper
    will look for `mobile-app/services/nutrition/enrichProducts.ts` under the repo root.
    """
    # compute repo root (modules -> pipeline -> database -> repo root)
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

    ts_path = None
    if config and isinstance(config, dict):
        ts_path = config.get("ts_path")
    if not ts_path:
        ts_path = os.path.join(repo_root, "mobile-app", "services", "nutrition", "enrichProducts.ts")
    if not os.path.isabs(ts_path):
        ts_path = os.path.join(repo_root, ts_path)

    if not os.path.exists(ts_path):
        raise FileNotFoundError(f"TypeScript enrichment script not found: {ts_path}")

    # Respect dry-run
    dry = False
    if config and isinstance(config, dict):
        dry = bool(config.get("dry_run"))
    if dry:
        print(f"DRY-RUN: skipping TypeScript enrichment subprocess for {ts_path}")
        return {"processed": None, "failures": None, "output": None, "module": os.path.basename(__file__)}

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Prefer npx ts-node if available; fall back to node if a .js build exists
    npx = shutil.which("npx")
    node = shutil.which("node")

    # If a compiled .js sibling exists, prefer running node on it
    js_candidate = os.path.splitext(ts_path)[0] + ".js"

    if os.path.exists(js_candidate) and node:
        cmd = [node, js_candidate, input_path, output_path]
    elif npx:
        cmd = [npx, "ts-node", ts_path, input_path, output_path]
    else:
        raise RuntimeError("Neither 'npx' nor a compiled JS file is available to run the TypeScript enrich script")

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Enrichment subprocess failed: {e}")

    # Return a minimal result dict expected by the pipeline
    return {"processed": None, "failures": None, "output": output_path, "module": os.path.basename(__file__)}
