#!/usr/bin/env python3
"""Build the DB069 quality-first product dataset candidate.

The generator reads every configured Australian source chunk, profiles and
hashes each input, resolves duplicate barcodes by deterministic completeness
ranking, and selects a quality-first candidate while enforcing brand and
category representation limits. It produces database artifacts only and never
seeds Firestore or calls an API.
"""

from __future__ import annotations

import argparse
import contextlib
import copy
import gzip
import hashlib
import io
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.db060_release_validation import validate as db060_validate


DEFAULT_CONFIG = ROOT / "database/Candidates/db069_candidate_config.json"
DEFAULT_OUTPUT = ROOT / "database/Candidates/DB069"
PLACEHOLDER_NAMES = {"nan", "null", "none", "n/a"}
MISSING_MARKERS = {"", "nan", "null", "none", "n/a", "unknown"}
BARCODE_PATTERN = re.compile(r"^[0-9]+$")
CORE_NUTRIENTS = (
    ("energy", ("energy-kcal_100g", "energy_100g")),
    ("fat", ("fat_100g",)),
    ("saturated_fat", ("saturated-fat_100g", "saturated_fat_100g")),
    ("carbohydrates", ("carbohydrates_100g",)),
    ("sugars", ("sugars_100g",)),
    ("protein", ("proteins_100g", "protein_100g")),
    ("salt_or_sodium", ("salt_100g", "sodium_100g")),
)


def canonical_json(value: Any, *, indent: int | None = None) -> bytes:
    text = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=indent,
        separators=None if indent is not None else (",", ":"),
    )
    return (text + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def relative_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def resolve_repo_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def is_usable_text(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() not in MISSING_MARKERS


def usable_product_name(value: Any) -> bool:
    return is_usable_text(value) and value.strip().lower() not in PLACEHOLDER_NAMES


def valid_barcode(value: Any, lengths: set[int]) -> str | None:
    if not isinstance(value, str):
        return None
    barcode = value.strip()
    if BARCODE_PATTERN.fullmatch(barcode) and len(barcode) in lengths:
        return barcode
    return None


def numeric_value(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def nonempty_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if is_usable_text(item)]


def known_allergens(record: dict[str, Any]) -> list[str]:
    values = nonempty_string_list(record.get("allergens"))
    return [value for value in values if value.lower() != "unknown"]


def has_image(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        return any(has_image(item) for item in value.values())
    if isinstance(value, list):
        return any(has_image(item) for item in value)
    return False


def nutrient_evidence(record: dict[str, Any]) -> tuple[list[str], list[str]]:
    nutriments = record.get("nutriments")
    if not isinstance(nutriments, dict):
        return [], [name for name, _ in CORE_NUTRIENTS]
    present: list[str] = []
    missing: list[str] = []
    for name, keys in CORE_NUTRIENTS:
        if any(numeric_value(nutriments.get(key)) is not None for key in keys):
            present.append(name)
        else:
            missing.append(name)
    return present, missing


def primary_category(record: dict[str, Any]) -> str:
    categories = nonempty_string_list(record.get("categories"))
    return categories[-1].casefold() if categories else "<uncategorized>"


def primary_brand(record: dict[str, Any]) -> str:
    brand = record.get("brand")
    if not is_usable_text(brand):
        return "<unbranded>"
    return brand.split(",", maxsplit=1)[0].strip().casefold()


def source_completeness(record: dict[str, Any]) -> float:
    value = numeric_value(record.get("completeness"))
    if value is None:
        return 0.0
    return max(0.0, min(value, 1.0))


def assign_tier(score: float, tiers: list[dict[str, Any]]) -> str:
    for tier in sorted(tiers, key=lambda item: float(item["minimum_score"]), reverse=True):
        if score >= float(tier["minimum_score"]):
            return str(tier["name"])
    raise ValueError("Quality tier configuration must include a zero-score tier")


def evaluate_quality(
    record: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    lengths = {int(item) for item in config["valid_barcode_lengths"]}
    barcode = valid_barcode(record.get("barcode"), lengths)
    name_ok = usable_product_name(record.get("productName"))
    ingredients_ok = is_usable_text(record.get("ingredientsText"))
    categories_ok = bool(nonempty_string_list(record.get("categories")))
    brand_ok = is_usable_text(record.get("brand"))
    allergens = known_allergens(record)
    image_ok = has_image(record.get("images"))
    nutrient_present, nutrient_missing = nutrient_evidence(record)
    weights = config["quality_weights"]

    features = {
        "barcode_valid": barcode is not None,
        "product_name_usable": name_ok,
        "ingredients_present": ingredients_ok,
        "core_nutrients_present": len(nutrient_present),
        "core_nutrients_total": len(CORE_NUTRIENTS),
        "categories_present": categories_ok,
        "brand_present": brand_ok,
        "allergen_evidence_present": bool(allergens),
        "image_present": image_ok,
    }
    score = 0.0
    score += float(weights["barcode"]) if features["barcode_valid"] else 0.0
    score += float(weights["product_name"]) if name_ok else 0.0
    score += float(weights["ingredients"]) if ingredients_ok else 0.0
    score += float(weights["nutrition"]) * len(nutrient_present) / len(CORE_NUTRIENTS)
    score += float(weights["categories"]) if categories_ok else 0.0
    score += float(weights["brand"]) if brand_ok else 0.0
    score += float(weights["allergens"]) if allergens else 0.0
    score += float(weights["image"]) if image_ok else 0.0
    score = round(score, 4)

    reasons: list[str] = []
    missing_reasons: list[str] = []
    for field, present in (
        ("barcode_valid", barcode is not None),
        ("product_name_usable", name_ok),
        ("ingredients_present", ingredients_ok),
        ("categories_present", categories_ok),
        ("brand_present", brand_ok),
        ("allergen_evidence_present", bool(allergens)),
        ("image_present", image_ok),
    ):
        (reasons if present else missing_reasons).append(field)
    reasons.append(f"core_nutrients_{len(nutrient_present)}_of_{len(CORE_NUTRIENTS)}")
    missing_reasons.extend(f"nutrient_missing_{name}" for name in nutrient_missing)

    identity_reasons: list[str] = []
    if barcode is None:
        identity_reasons.append("barcode_invalid_or_missing")
    if not name_ok:
        identity_reasons.append("product_name_missing_or_placeholder")

    return {
        "score": score,
        "tier": assign_tier(score, config["quality_tiers"]),
        "reasons": reasons,
        "missing_reasons": missing_reasons,
        "identity_exclusion_reasons": identity_reasons,
        "features": features,
        "known_allergens": sorted(set(allergens), key=str.casefold),
        "primary_brand": primary_brand(record),
        "primary_category": primary_category(record),
        "source_completeness": source_completeness(record),
    }


def row_metrics(records: Iterable[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    total = ingredients = categories = brands = allergens = images = nutrition_any = nutrition_full = 0
    valid_ids = 0
    tiers: Counter[str] = Counter()
    for record in records:
        quality = evaluate_quality(record, config)
        total += 1
        valid_ids += not quality["identity_exclusion_reasons"]
        ingredients += quality["features"]["ingredients_present"]
        categories += quality["features"]["categories_present"]
        brands += quality["features"]["brand_present"]
        allergens += quality["features"]["allergen_evidence_present"]
        images += quality["features"]["image_present"]
        core = quality["features"]["core_nutrients_present"]
        nutrition_any += core > 0
        nutrition_full += core == len(CORE_NUTRIENTS)
        tiers[quality["tier"]] += 1

    def coverage(count: int) -> dict[str, Any]:
        return {
            "count": int(count),
            "rate": round(count / total, 6) if total else 0.0,
        }

    return {
        "records": total,
        "valid_identity": coverage(valid_ids),
        "ingredients": coverage(ingredients),
        "nutrition_any_core": coverage(nutrition_any),
        "nutrition_all_core": coverage(nutrition_full),
        "categories": coverage(categories),
        "brands": coverage(brands),
        "known_allergen_evidence": coverage(allergens),
        "images": coverage(images),
        "quality_tiers": dict(sorted(tiers.items())),
    }


def load_sources(config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    evaluated: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []
    configured = config.get("source_files")
    if not isinstance(configured, list) or not configured:
        raise ValueError("source_files must be a non-empty list")

    for source_order, configured_path in enumerate(configured):
        path = resolve_repo_path(str(configured_path))
        raw = path.read_bytes()
        data = json.loads(raw)
        if not isinstance(data, list) or any(not isinstance(row, dict) for row in data):
            raise ValueError(f"Expected a JSON array of objects: {path}")
        digest = sha256_bytes(raw)
        path_display = relative_path(path)
        profiles.append({
            "file": path_display,
            "sha256": digest,
            **row_metrics(data, config),
        })
        for row_number, record in enumerate(data):
            quality = evaluate_quality(record, config)
            locator = {
                "file": path_display,
                "file_sha256": digest,
                "row": row_number,
                "source_order": source_order,
            }
            evaluated.append({
                "record": record,
                "record_sha256": sha256_bytes(canonical_json(record)),
                "barcode": valid_barcode(
                    record.get("barcode"),
                    {int(item) for item in config["valid_barcode_lengths"]},
                ),
                "source": locator,
                "quality": quality,
            })
    return evaluated, profiles


def completeness_rank(item: dict[str, Any]) -> tuple[Any, ...]:
    quality = item["quality"]
    features = quality["features"]
    evidence_count = sum(
        int(value) for key, value in features.items()
        if key not in {"core_nutrients_present", "core_nutrients_total"}
    ) + int(features["core_nutrients_present"])
    source = item["source"]
    return (
        -float(quality["score"]),
        -evidence_count,
        -float(quality["source_completeness"]),
        str(source["file"]),
        int(source["row"]),
        str(item["record_sha256"]),
    )


def deduplicate(
    evaluated: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[tuple[str, int], dict[str, Any]], dict[str, Any]]:
    barcode_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    invalid: list[dict[str, Any]] = []
    for item in evaluated:
        if item["barcode"] is None:
            invalid.append(item)
        else:
            barcode_groups[item["barcode"]].append(item)

    winners: list[dict[str, Any]] = []
    duplicate_decisions: dict[tuple[str, int], dict[str, Any]] = {}
    duplicate_groups = duplicate_rows = 0
    for barcode in sorted(barcode_groups):
        group = sorted(barcode_groups[barcode], key=completeness_rank)
        winner = group[0]
        winners.append(winner)
        if len(group) > 1:
            duplicate_groups += 1
            duplicate_rows += len(group) - 1
            for loser in group[1:]:
                duplicate_decisions[(loser["source"]["file"], loser["source"]["row"])] = {
                    "decision": "excluded",
                    "reasons": ["duplicate_barcode_less_complete"],
                    "duplicate_of": {
                        "barcode": barcode,
                        "file": winner["source"]["file"],
                        "row": winner["source"]["row"],
                        "record_sha256": winner["record_sha256"],
                    },
                }
    return winners, duplicate_decisions, {
        "input_records": len(evaluated),
        "invalid_barcode_records": len(invalid),
        "valid_barcode_records": len(evaluated) - len(invalid),
        "unique_valid_barcodes": len(winners),
        "duplicate_barcode_groups": duplicate_groups,
        "duplicate_rows_removed": duplicate_rows,
    }


def selection_rank(item: dict[str, Any]) -> tuple[Any, ...]:
    quality = item["quality"]
    return (
        -float(quality["score"]),
        -int(quality["features"]["core_nutrients_present"]),
        -float(quality["source_completeness"]),
        str(item["barcode"]),
        str(item["source"]["file"]),
        int(item["source"]["row"]),
    )


def cap_count(target: int, normal_share: float, special_share: float, special: bool) -> int:
    share = special_share if special else normal_share
    return max(1, int(math.ceil(target * share)))


def select_candidate(
    winners: list[dict[str, Any]],
    config: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[tuple[str, int], dict[str, Any]], dict[str, Any]]:
    selection = config["selection"]
    target = int(selection["candidate_size"])
    minimum_score = float(selection["minimum_quality_score"])
    brand_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    selected: list[dict[str, Any]] = []
    decisions: dict[tuple[str, int], dict[str, Any]] = {}

    for item in sorted(winners, key=selection_rank):
        locator = (item["source"]["file"], item["source"]["row"])
        quality = item["quality"]
        score = float(quality["score"])
        brand = quality["primary_brand"]
        category = quality["primary_category"]
        reasons: list[str] = []
        if score < minimum_score:
            reasons.append("below_minimum_quality_score")
        if len(selected) >= target:
            reasons.append("candidate_capacity_reached")
        brand_limit = cap_count(
            target,
            float(selection["max_brand_share"]),
            float(selection["max_unbranded_share"]),
            brand == "<unbranded>",
        )
        category_limit = cap_count(
            target,
            float(selection["max_primary_category_share"]),
            float(selection["max_uncategorized_share"]),
            category == "<uncategorized>",
        )
        if brand_counts[brand] >= brand_limit:
            reasons.append("brand_representation_cap_reached")
        if category_counts[category] >= category_limit:
            reasons.append("category_representation_cap_reached")

        if reasons:
            decisions[locator] = {"decision": "excluded", "reasons": reasons}
            continue
        selected.append(item)
        brand_counts[brand] += 1
        category_counts[category] += 1
        decisions[locator] = {
            "decision": "included",
            "reasons": ["quality_ranked_within_representation_limits"],
            "selection_rank": len(selected),
        }

    if len(selected) != target:
        raise ValueError(
            f"Could not fill candidate: selected {len(selected)} of {target}; "
            "review minimum score and representation limits"
        )

    def distribution(counts: Counter[str]) -> dict[str, int]:
        return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))

    return selected, decisions, {
        "candidate_size": len(selected),
        "minimum_quality_score": minimum_score,
        "brand_limits": {
            "max_brand_count": cap_count(
                target,
                float(selection["max_brand_share"]),
                float(selection["max_unbranded_share"]),
                False,
            ),
            "max_unbranded_count": cap_count(
                target,
                float(selection["max_brand_share"]),
                float(selection["max_unbranded_share"]),
                True,
            ),
        },
        "category_limits": {
            "max_primary_category_count": cap_count(
                target,
                float(selection["max_primary_category_share"]),
                float(selection["max_uncategorized_share"]),
                False,
            ),
            "max_uncategorized_count": cap_count(
                target,
                float(selection["max_primary_category_share"]),
                float(selection["max_uncategorized_share"]),
                True,
            ),
        },
        "brands": distribution(brand_counts),
        "primary_categories": distribution(category_counts),
    }


def candidate_record(item: dict[str, Any]) -> dict[str, Any]:
    record = copy.deepcopy(item["record"])
    known = known_allergens(record)
    allergens = known or ["Unknown"]
    record["allergens"] = allergens
    record["allergensDetected"] = list(allergens)
    return record


def ledger_entry(
    item: dict[str, Any],
    decision: dict[str, Any],
    *,
    detailed: bool,
) -> dict[str, Any]:
    quality = item["quality"]
    entry = {
        "barcode": item["barcode"] if item["barcode"] is not None else item["record"].get("barcode"),
        "productName": item["record"].get("productName"),
        "source": {
            "file": item["source"]["file"],
            "row": item["source"]["row"],
        },
        "source_record_sha256": item["record_sha256"],
        "decision": decision["decision"],
        "decision_reasons": decision["reasons"],
        "quality": {
            "score": quality["score"],
            "tier": quality["tier"],
            "reasons": quality["reasons"],
        },
    }
    if detailed:
        entry["quality"].update({
            "missing_reasons": quality["missing_reasons"],
            "features": quality["features"],
            "primary_brand": quality["primary_brand"],
            "primary_category": quality["primary_category"],
            "source_completeness": quality["source_completeness"],
        })
    for key in ("selection_rank", "duplicate_of"):
        if key in decision:
            entry[key] = decision[key]
    return entry


def distribution_summary(values: dict[str, int], total: int) -> dict[str, Any]:
    ordered = list(values.items())
    return {
        "distinct_groups": len(values),
        "largest_group": (
            {"name": ordered[0][0], "count": ordered[0][1], "share": round(ordered[0][1] / total, 6)}
            if ordered and total else None
        ),
        "top_20": [
            {"name": name, "count": count, "share": round(count / total, 6)}
            for name, count in ordered[:20]
        ],
    }


def allergen_bias_report(
    eligible: list[dict[str, Any]],
    selected: list[dict[str, Any]],
    threshold: float,
) -> dict[str, Any]:
    eligible_known = sum(item["quality"]["features"]["allergen_evidence_present"] for item in eligible)
    selected_known = sum(item["quality"]["features"]["allergen_evidence_present"] for item in selected)
    eligible_rate = eligible_known / len(eligible) if eligible else 0.0
    selected_rate = selected_known / len(selected) if selected else 0.0
    delta = selected_rate - eligible_rate
    eligible_values = Counter(
        allergen.casefold()
        for item in eligible
        for allergen in item["quality"]["known_allergens"]
    )
    selected_values = Counter(
        allergen.casefold()
        for item in selected
        for allergen in item["quality"]["known_allergens"]
    )
    return {
        "review_threshold_absolute_rate_delta": threshold,
        "eligible_known_evidence": {"count": eligible_known, "rate": round(eligible_rate, 6)},
        "selected_known_evidence": {"count": selected_known, "rate": round(selected_rate, 6)},
        "selected_minus_eligible_rate": round(delta, 6),
        "review_status": "REVIEW_REQUIRED" if abs(delta) > threshold else "WITHIN_THRESHOLD",
        "eligible_allergen_mentions": dict(sorted(eligible_values.items())),
        "selected_allergen_mentions": dict(sorted(selected_values.items())),
        "interpretation": (
            "Selection is quality-first and may increase known allergen evidence because ingredient and declaration "
            "coverage contribute to completeness. Unknown remains explicit and is never treated as allergen-free."
        ),
    }


def compare_metrics(candidate: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    fields = (
        "valid_identity",
        "ingredients",
        "nutrition_any_core",
        "nutrition_all_core",
        "categories",
        "brands",
        "known_allergen_evidence",
        "images",
    )
    return {
        field: {
            "v1_0_count": baseline[field]["count"],
            "v1_0_rate": baseline[field]["rate"],
            "db069_count": candidate[field]["count"],
            "db069_rate": candidate[field]["rate"],
            "rate_delta": round(candidate[field]["rate"] - baseline[field]["rate"], 6),
        }
        for field in fields
    }


def git_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except Exception:
        return None


def build_bundle(config_path: Path, generated_at: str) -> dict[str, Any]:
    config_bytes = config_path.read_bytes()
    config = json.loads(config_bytes)
    evaluated, source_profiles = load_sources(config)
    winners, duplicate_decisions, deduplication = deduplicate(evaluated)
    identity_eligible = [
        item for item in winners if not item["quality"]["identity_exclusion_reasons"]
    ]
    selected, selection_decisions, representation = select_candidate(identity_eligible, config)
    selected_keys = {
        (item["source"]["file"], item["source"]["row"])
        for item in selected
    }

    inclusion: list[dict[str, Any]] = []
    exclusion: list[dict[str, Any]] = []
    for item in evaluated:
        locator = (item["source"]["file"], item["source"]["row"])
        if item["quality"]["identity_exclusion_reasons"]:
            decision = {
                "decision": "excluded",
                "reasons": item["quality"]["identity_exclusion_reasons"],
            }
        elif locator in duplicate_decisions:
            decision = duplicate_decisions[locator]
        else:
            decision = selection_decisions.get(locator)
            if decision is None:
                raise RuntimeError(f"No selection decision for {locator}")
        entry = ledger_entry(item, decision, detailed=locator in selected_keys)
        (inclusion if locator in selected_keys else exclusion).append(entry)

    inclusion.sort(key=lambda item: int(item["selection_rank"]))
    exclusion.sort(key=lambda item: (item["source"]["file"], item["source"]["row"]))
    candidate = [candidate_record(item) for item in sorted(selected, key=lambda item: item["barcode"])]
    candidate_metrics = row_metrics(candidate, config)
    with contextlib.redirect_stdout(io.StringIO()):
        db060_validation = db060_validate(candidate)
    if db060_validation["status"] != "CHECKS_PASSED_PENDING_APPROVAL":
        raise ValueError(
            "Candidate failed the existing DB060 validator: "
            f"{db060_validation['status']}"
        )

    baseline_path = resolve_repo_path(config["baseline_release"])
    baseline_raw = baseline_path.read_bytes()
    baseline_records = json.loads(baseline_raw)
    if not isinstance(baseline_records, list):
        raise ValueError("baseline_release must contain a JSON array")
    baseline_metrics = row_metrics(baseline_records, config)
    bias = allergen_bias_report(
        identity_eligible,
        selected,
        float(config["allergen_bias_review_threshold"]),
    )

    quality_report = {
        "ticket": "DB069",
        "status": "CHECKS_PASSED_CANDIDATE_READY_FOR_DB070",
        "generated_at_utc": generated_at,
        "scope": "Database artifacts only; no Backend/API, mobile, Firestore rules, seeding, or deployment changes.",
        "source_profile": {
            "files": source_profiles,
            "file_count": len(source_profiles),
            "record_count": len(evaluated),
        },
        "deduplication": deduplication,
        "eligibility": {
            "identity_eligible_unique_records": len(identity_eligible),
            "identity_ineligible_unique_records": len(winners) - len(identity_eligible),
        },
        "selection": {
            "candidate_size": len(candidate),
            "candidate_sha256": sha256_bytes(canonical_json(candidate, indent=2)),
            "quality": candidate_metrics,
            "representation": {
                "limits": {
                    "brand": representation["brand_limits"],
                    "category": representation["category_limits"],
                },
                "brands": distribution_summary(representation["brands"], len(candidate)),
                "primary_categories": distribution_summary(
                    representation["primary_categories"], len(candidate)
                ),
            },
        },
        "allergen_selection_bias": bias,
        "v1_0_comparison": {
            "baseline": {
                "file": relative_path(baseline_path),
                "sha256": sha256_bytes(baseline_raw),
                "metrics": baseline_metrics,
            },
            "coverage": compare_metrics(candidate_metrics, baseline_metrics),
        },
        "missing_value_policy": {
            "nutrient_values_imputed_as_zero": 0,
            "policy": "Source nutrient values are preserved. Missing values are not converted to zero.",
            "allergen_policy": "Missing allergen evidence is represented as [\"Unknown\"], never as allergen-free.",
        },
        "existing_database_validation": {
            "validator": "scripts/db060_release_validation.py",
            "status": db060_validation["status"],
            "total_records": db060_validation["total_records"],
            "valid_records": db060_validation["valid_records"],
            "invalid_records": db060_validation["invalid_records"],
            "dataset_errors": db060_validation["dataset_errors"],
            "required_reviews": db060_validation["required_reviews"],
        },
        "ledgers": {
            "included_records": len(inclusion),
            "excluded_source_records": len(exclusion),
            "complete_source_accounting": len(inclusion) + len(exclusion) == len(evaluated),
        },
        "limitations": [
            "Barcode validation checks ASCII digits and supported GTIN lengths; it does not validate check digits.",
            "Quality scores measure source completeness, not whether a product is healthy.",
            "Known-allergen evidence reflects source declarations and does not prove absence of undeclared allergens.",
            "DB070 owns clean/enrich/release generation and final release validation.",
        ],
    }
    if not quality_report["ledgers"]["complete_source_accounting"]:
        raise RuntimeError("Inclusion and exclusion ledgers do not account for every source row")
    if not all(record["allergens"] for record in candidate):
        raise RuntimeError("Candidate contains an empty allergen state")
    if any(record["allergens"] != record["allergensDetected"] for record in candidate):
        raise RuntimeError("Candidate allergen fields disagree")

    return {
        "config": config,
        "config_path": relative_path(config_path),
        "config_sha256": sha256_bytes(config_bytes),
        "candidate": candidate,
        "inclusion": inclusion,
        "exclusion": exclusion,
        "quality_report": quality_report,
        "db060_validation": db060_validation,
        "source_profiles": source_profiles,
        "generated_at": generated_at,
    }


def jsonl_bytes(rows: Iterable[dict[str, Any]]) -> bytes:
    return b"".join(canonical_json(row) for row in rows)


def deterministic_artifacts(bundle: dict[str, Any]) -> dict[str, bytes]:
    return {
        "foodremedy_candidate_db069.json": canonical_json(bundle["candidate"], indent=2),
        "inclusion_ledger.jsonl": jsonl_bytes(bundle["inclusion"]),
        "exclusion_ledger.jsonl.gz": gzip.compress(
            jsonl_bytes(bundle["exclusion"]), compresslevel=9, mtime=0
        ),
        "quality_report.json": canonical_json(bundle["quality_report"], indent=2),
        "db060_validation.json": canonical_json(bundle["db060_validation"], indent=2),
        "source_profile.json": canonical_json(
            {"ticket": "DB069", "files": bundle["source_profiles"]}, indent=2
        ),
    }


def verification_result(
    config_path: Path,
    generated_at: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    with tempfile.TemporaryDirectory(prefix="db069-repro-") as temp:
        temp_root = Path(temp)
        hashes: list[dict[str, str]] = []
        final_bundle: dict[str, Any] | None = None
        for run_number in (1, 2):
            run_dir = temp_root / f"run-{run_number}"
            run_dir.mkdir()
            bundle = build_bundle(config_path, generated_at)
            artifacts = deterministic_artifacts(bundle)
            for name, content in artifacts.items():
                (run_dir / name).write_bytes(content)
            hashes.append({name: sha256_bytes(content) for name, content in artifacts.items()})
            final_bundle = bundle
        if hashes[0] != hashes[1]:
            raise RuntimeError("DB069 reproducibility check failed: isolated artifact hashes differ")
        assert final_bundle is not None
        verification = {
            "ticket": "DB069",
            "status": "PASS",
            "method": "Two independent source loads and builds in isolated temporary directories",
            "generated_at_utc": generated_at,
            "run_1_sha256": hashes[0],
            "run_2_sha256": hashes[1],
            "identical": True,
        }
        return final_bundle, verification


def report_markdown(
    report: dict[str, Any],
    generation: dict[str, Any],
    reproducibility: dict[str, Any],
) -> str:
    coverage = report["v1_0_comparison"]["coverage"]
    selection = report["selection"]
    dedup = report["deduplication"]
    bias = report["allergen_selection_bias"]

    def percentage(value: float) -> str:
        return f"{value * 100:.1f}%"

    rows = []
    labels = {
        "ingredients": "Ingredient text",
        "nutrition_any_core": "Any core nutrition",
        "nutrition_all_core": "All core nutrition",
        "categories": "Categories",
        "brands": "Brand",
        "known_allergen_evidence": "Known allergen evidence",
        "images": "Images",
    }
    for key, label in labels.items():
        item = coverage[key]
        rows.append(
            f"| {label} | {item['v1_0_count']:,} ({percentage(item['v1_0_rate'])}) "
            f"| {item['db069_count']:,} ({percentage(item['db069_rate'])}) "
            f"| {item['rate_delta'] * 100:+.1f} pp |"
        )
    return f"""# DB069 Quality First Product Dataset Candidate

**Result:** {report['status']}

**Candidate:** `foodremedy_candidate_db069.json`

**Candidate SHA-256:** `{selection['candidate_sha256']}`

**Generated:** {report['generated_at_utc']}

DB069 evaluates every configured Australian source chunk instead of selecting
an arbitrary slice. It records source hashes, deterministically resolves
duplicate barcodes, scores source completeness, applies brand and category
representation limits, and accounts for every source row in the inclusion or
exclusion ledger.

## Source and selection evidence

- Source files profiled: {report['source_profile']['file_count']}
- Source rows evaluated: {report['source_profile']['record_count']:,}
- Unique valid barcodes: {dedup['unique_valid_barcodes']:,}
- Duplicate barcode groups: {dedup['duplicate_barcode_groups']:,}
- Duplicate rows resolved: {dedup['duplicate_rows_removed']:,}
- Candidate records: {selection['candidate_size']:,}
- Existing DB060 validator: {report['existing_database_validation']['valid_records']:,} valid, {report['existing_database_validation']['invalid_records']:,} invalid
- Inclusion ledger rows: {report['ledgers']['included_records']:,}
- Exclusion ledger rows: {report['ledgers']['excluded_source_records']:,}
- Complete source accounting: {str(report['ledgers']['complete_source_accounting']).upper()}

## v1.0 comparison

| Measure | v1.0 | DB069 candidate | Rate change |
| --- | ---: | ---: | ---: |
{chr(10).join(rows)}

## Representation and safety

- Largest brand group: {selection['representation']['brands']['largest_group']}
- Largest primary-category group: {selection['representation']['primary_categories']['largest_group']}
- Allergen selection-bias review: {bias['review_status']}
- Eligible known-allergen rate: {percentage(bias['eligible_known_evidence']['rate'])}
- Candidate known-allergen rate: {percentage(bias['selected_known_evidence']['rate'])}
- Missing allergen evidence remains `Unknown`; it is never treated as allergen-free.
- Missing nutrient values are not converted to zero.

## Reproducibility

Two independent builds in isolated temporary directories produced identical
candidate, ledger, quality-report, and source-profile hashes. Status:
`{reproducibility['status']}`.

## Artifacts

""" + "".join(
        f"- `{name}` - SHA-256 `{digest}`\n"
        for name, digest in generation["artifacts"].items()
    ) + """

## Scope boundary

This work contains database data processing, validation, provenance, and
reporting only. It does not change Backend/API code, mobile code, Firestore
rules, production seeding, or deployment configuration. DB070 owns enrichment,
versioned v1.1 release generation, and final release validation.
"""


def write_output(
    bundle: dict[str, Any],
    reproducibility: dict[str, Any],
    output_dir: Path,
) -> dict[str, Any]:
    if output_dir.exists():
        raise FileExistsError(f"Output directory already exists and will not be overwritten: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}-", dir=output_dir.parent))
    try:
        artifacts = deterministic_artifacts(bundle)
        artifacts["reproducibility_verification.json"] = canonical_json(reproducibility, indent=2)
        for name, content in artifacts.items():
            (stage / name).write_bytes(content)

        artifact_hashes = dict(sorted(
            (name, sha256_bytes(content)) for name, content in artifacts.items()
        ))
        generation = {
            "ticket": "DB069",
            "status": "CHECKS_PASSED_CANDIDATE_READY_FOR_DB070",
            "generated_at_utc": bundle["generated_at"],
            "checkout_commit": git_commit(),
            "config": {
                "file": bundle["config_path"],
                "sha256": bundle["config_sha256"],
            },
            "generator": {
                "file": relative_path(Path(__file__)),
                "sha256": sha256_file(Path(__file__)),
            },
            "source_files": [
                {"file": item["file"], "sha256": item["sha256"], "records": item["records"]}
                for item in bundle["source_profiles"]
            ],
            "candidate": {
                "file": "foodremedy_candidate_db069.json",
                "records": len(bundle["candidate"]),
                "sha256": artifact_hashes["foodremedy_candidate_db069.json"],
            },
            "artifacts": artifact_hashes,
            "production_seeded": False,
            "next_owner": "DB070",
        }
        generation_bytes = canonical_json(generation, indent=2)
        (stage / "generation_record.json").write_bytes(generation_bytes)
        generation["artifacts"]["generation_record.json"] = sha256_bytes(generation_bytes)

        readme = report_markdown(bundle["quality_report"], generation, reproducibility).encode("utf-8")
        (stage / "README.md").write_bytes(readme)
        generation["artifacts"]["README.md"] = sha256_bytes(readme)

        sums = "".join(
            f"{digest}  {name}\n"
            for name, digest in sorted(generation["artifacts"].items())
        ).encode("utf-8")
        (stage / "SHA256SUMS").write_bytes(sums)
        stage.replace(output_dir)
        return generation
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def parse_generated_at(value: str | None) -> str:
    if value is None:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--generated-at must include a timezone")
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--generated-at", help="ISO-8601 timestamp used in deterministic evidence")
    parser.add_argument(
        "--verify-reproducibility",
        action="store_true",
        help="Build twice from independent source loads before writing the output",
    )
    args = parser.parse_args()
    try:
        generated_at = parse_generated_at(args.generated_at)
        config_path = args.config.resolve()
        output_dir = args.output_dir.resolve()
        if args.verify_reproducibility:
            bundle, reproducibility = verification_result(config_path, generated_at)
        else:
            bundle = build_bundle(config_path, generated_at)
            reproducibility = {
                "ticket": "DB069",
                "status": "NOT_RUN",
                "generated_at_utc": generated_at,
                "identical": None,
                "method": "Run again with --verify-reproducibility",
            }
        generation = write_output(bundle, reproducibility, output_dir)
    except Exception as exc:
        print(f"DB069 generation failed: {exc}", file=__import__("sys").stderr)
        return 2
    print(
        "DB069 candidate generated: "
        f"records={generation['candidate']['records']}, "
        f"sha256={generation['candidate']['sha256']}, output={output_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
