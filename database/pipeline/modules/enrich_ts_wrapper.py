"""
Optional enrich step: invoke TypeScript enricher if configured, else pass-through.

Enrich stage expects: run(input_path, output_path, config) -> dict

Config keys:
  ts_path: path to a TS/JS entry file (relative to repo root or absolute)
  node_cmd: optional command prefix, default "npx ts-node" or "node"
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def run(input_path: str, output_path: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Load JSON array from input_path, optionally run TS enricher, write output_path.
    This module is not part of DB007 missing-field logic; it is the enrich-stage hook.
    """
    config = config or {}
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    ts_rel = config.get("ts_path") or ""

    if ts_rel:
        ts_path = ts_rel if os.path.isabs(ts_rel) else os.path.join(repo_root, ts_rel)
    else:
        ts_path = ""

    out_dir = os.path.dirname(os.path.abspath(output_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    if ts_path and os.path.isfile(ts_path):
        cmd = config.get("node_cmd")
        if not cmd:
            # Prefer npx ts-node for .ts files
            cmd_list = ["npx", "--yes", "ts-node", ts_path, input_path, output_path]
        else:
            cmd_list = cmd.split() + [ts_path, input_path, output_path]
        try:
            subprocess.run(cmd_list, cwd=repo_root, check=True, capture_output=True, text=True)
            logger.info("[enrich_ts_wrapper] TS enricher finished: %s", ts_path)
            return {"processed": None, "failures": 0, "output": output_path, "mode": "ts"}
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.warning(
                "[enrich_ts_wrapper] TS step failed (%s); copying input to output.",
                e,
            )

    shutil.copyfile(input_path, output_path)
    try:
        with open(output_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        n = len(data) if isinstance(data, list) else 0
    except Exception:
        n = None
    logger.info("[enrich_ts_wrapper] Pass-through copy %s -> %s (records=%s)", input_path, output_path, n)
    return {"processed": n, "failures": 0, "output": output_path, "mode": "passthrough"}
