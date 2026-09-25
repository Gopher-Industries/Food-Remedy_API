#!/usr/bin/env python3
"""Replay the production category rules without changing the input dataset."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from database.clean_data.cleanProductData import clean_category_tags, standardise_category


def audit(path, baseline=None):
    path = Path(path)
    raw = path.read_bytes()
    products = json.loads(raw)
    if not isinstance(products, list) or any(not isinstance(p, dict) for p in products):
        raise ValueError("Expected a JSON array of product objects")
    digest = hashlib.sha256(raw).hexdigest()
    if baseline is not None and baseline["dataset_sha256"] != digest:
        raise ValueError("Before/after comparison requires the identical dataset SHA-256")

    buckets = Counter()
    unmapped_tags = Counter()
    classified = []
    missing = inconsistent = stored = conflicts = 0
    for index, product in enumerate(products):
        tags = product.get("categories")
        cleaned = clean_category_tags(tags) if isinstance(tags, (list, str)) else []
        bucket = standardise_category(cleaned)
        buckets[bucket] += 1
        if not cleaned:
            missing += 1
        else:
            classified.append({"index": index, "barcode": product.get("barcode"), "bucket": bucket})
            if bucket == "other":
                unmapped_tags.update(set(cleaned))
        # Tag order is not a defect: source lists can retain their taxonomy hierarchy.
        if tags is not None and (
            not isinstance(tags, list) or tags != cleaned or len(cleaned) != len(set(cleaned))
        ):
            inconsistent += 1
        primary = product.get("category")
        if isinstance(primary, str) and primary.strip():
            stored += 1
            if bucket != "other" and primary.strip().lower() != bucket:
                conflicts += 1

    report = {
        "dataset": path.name,
        "dataset_sha256": digest,
        "classifier_sha256": hashlib.sha256(
            (ROOT / "database/clean_data/cleanProductData.py").read_bytes()
        ).hexdigest(),
        "measurement": "Rule replay on stored categories; source and stored category fields are unchanged",
        "total_records": len(products),
        "missing_category_tags": missing,
        "tagged_records": len(classified),
        "tag_representation_issues": inconsistent,
        "stored_primary_categories": stored,
        "stored_primary_rule_conflicts_for_review": conflicts,
        "mapped_records": len(products) - buckets["other"],
        "tagged_but_unmapped": buckets["other"] - missing,
        "bucket_counts": dict(sorted(buckets.items())),
        "unmapped_tag_counts": dict(unmapped_tags.most_common()),
        "classified_records": classified,
    }
    if baseline is not None:
        previous = {p["index"]: p for p in baseline["classified_records"]}
        if set(previous) != {p["index"] for p in classified}:
            raise ValueError("Baseline does not contain the same tagged records")
        changes = []
        for item in classified:
            old = previous[item["index"]]
            if old["barcode"] != item["barcode"]:
                raise ValueError("Baseline record identity mismatch")
            if old["bucket"] != item["bucket"]:
                changes.append({**item, "before": old["bucket"],
                                "source_tags": products[item["index"]]["categories"]})
        report["comparison"] = {
            "baseline_classifier_sha256": baseline["classifier_sha256"],
            "changed_records": len(changes),
            "previously_mapped_records_changed": sum(c["before"] != "other" for c in changes),
            "changes": changes,
        }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    if args.output.resolve() in {p.resolve() for p in (args.input, args.baseline) if p}:
        parser.error("Report must not overwrite the dataset or baseline")
    baseline = json.loads(args.baseline.read_text()) if args.baseline else None
    report = audit(args.input, baseline)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{report['mapped_records']}/{report['total_records']} mapped; "
          f"{report['missing_category_tags']} missing; {report['tagged_but_unmapped']} tagged but unmapped")


if __name__ == "__main__":
    main()
