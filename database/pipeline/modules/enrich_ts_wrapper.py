import os
import subprocess
import shutil
import json
from typing import Optional


def run(input_path: str, output_path: str, config: dict):
    """Run the TypeScript enrichment script as a subprocess.

    Expects the TS script `enrichProducts.ts` to accept two args: <input.json> <output.json>
    """

    # -----------------------------
    # Resolve repo root
    # -----------------------------
    repo_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..")
    )

    # -----------------------------
    # Resolve TS path
    # -----------------------------
    ts_path = None
    if config and isinstance(config, dict):
        ts_path = config.get("ts_path")

    if not ts_path:
        ts_path = os.path.join(
            repo_root,
            "mobile-app",
            "services",
            "nutrition",
            "enrichProducts.ts"
        )

    if not os.path.isabs(ts_path):
        ts_path = os.path.join(repo_root, ts_path)

    if not os.path.exists(ts_path):
        raise FileNotFoundError(
            f"TypeScript enrichment script not found: {ts_path}"
        )

    # -----------------------------
    # Dry run support
    # -----------------------------
    dry = False
    if config and isinstance(config, dict):
        dry = bool(config.get("dry_run"))

    if dry:
        print(f"DRY-RUN: skipping enrichment for {ts_path}")
        return {
            "processed": None,
            "failures": None,
            "output": None,
            "module": os.path.basename(__file__)
        }

    # -----------------------------
    # Ensure output directory exists
    # -----------------------------
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # -----------------------------
    # Resolve execution command
    # -----------------------------
    npx = shutil.which("npx")
    node = shutil.which("node")

    js_candidate = os.path.splitext(ts_path)[0] + ".js"

    if os.path.exists(js_candidate) and node:
        cmd = [node, js_candidate, input_path, output_path]
    elif npx:
        cmd = [npx, "ts-node", ts_path, input_path, output_path]
    else:
        raise RuntimeError(
            "Neither 'npx' nor compiled JS available to run enrichment"
        )

    # -----------------------------
    # Run subprocess
    # -----------------------------
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Enrichment subprocess failed: {e}")

    # -----------------------------
    # CRITICAL FIX: Verify output file exists
    # -----------------------------
    if not os.path.exists(output_path):
        raise FileNotFoundError(
            f"[ENRICH ERROR] Expected output file not created: {output_path}"
        )

    # -----------------------------
    # Count processed records (optional but useful)
    # -----------------------------
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            processed_count = len(data) if isinstance(data, list) else 1
    except Exception:
        processed_count = None

    # -----------------------------
    # Return result to pipeline
    # -----------------------------
    return {
        "processed": processed_count,
        "failures": None,
        "output": output_path,
        "module": os.path.basename(__file__)
    }