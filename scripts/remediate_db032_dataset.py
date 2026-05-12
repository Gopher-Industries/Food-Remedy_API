#!/usr/bin/env python3
"""Apply DB032 remediation rules to a dataset slice."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from database.pipeline.modules.db032_remediation import remediate_dataset


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remediate DB032 systemic data issues")
    parser.add_argument("--input", "-i", required=True, type=Path, help="Input dataset path (JSON array/object)")
    parser.add_argument("--output", "-o", required=True, type=Path, help="Output remediated dataset path")
    parser.add_argument(
        "--evidence",
        type=Path,
        default=REPO_ROOT / "scripts" / "reports" / "db032_remediation_evidence.json",
        help="Output path for remediation evidence stats",
    )
    return parser.parse_args(argv)


def load(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        return [data]
    if not isinstance(data, list):
        raise ValueError(f"Expected list/dict JSON payload, got {type(data)}")
    return [item for item in data if isinstance(item, dict)]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    records = load(args.input)
    remediated, stats = remediate_dataset(records)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(remediated, handle, indent=2, ensure_ascii=False)

    evidence = {
        "ticket": "DB040",
        "source": str(args.input),
        "output": str(args.output),
        "total_records": len(remediated),
        "remediation_stats": stats,
    }
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    with args.evidence.open("w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, ensure_ascii=False)

    print(f"DB032 remediation complete for {len(remediated)} records")
    print(f"Output: {args.output}")
    print(f"Evidence: {args.evidence}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
