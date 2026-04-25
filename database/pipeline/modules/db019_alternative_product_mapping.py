"""
DB019 — Alternative product mapping (similar + healthier peers).

Builds per-product alternative lists for the recommendation layer:
- **similar**: closest products in the same primary category using a bounded nutrient-space distance
  (pairwise-complete dimensions; missing values do not inflate similarity).
- **healthier**: same category, clearly higher health score (DB010 composite / provisional),
  and still nutritionally close enough to count as a substitute.

Outputs are stored on each record at ``enrichment.alternatives`` (versioned shape). Optional
``sidecar_index_path`` writes ``barcode -> { similar, healthier }`` for lightweight API use.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import random
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

# --- DB010 health score (reuse thresholds / view) ---
from database.pipeline.modules.nutrition_enrich import compute_health_score_for_record

ALT_VERSION = 1


def _safe_str(x: Any) -> str:
    if x is None:
        return ""
    return str(x).strip()


def _category_key(record: Dict[str, Any]) -> str:
    """Primary category bucket: harmonised ``category``, else first ``categories`` entry."""
    cat = record.get("category")
    if isinstance(cat, str) and cat.strip():
        return cat.strip().lower()
    cats = record.get("categories") or []
    if isinstance(cats, list) and cats:
        first = cats[0]
        if isinstance(first, str) and first.strip():
            return first.strip().lower()
    return "__uncategorized__"


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)):
            f = float(v)
        else:
            f = float(str(v).strip().replace(",", "."))
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def _nutrient_raw_vector(record: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """Same logical fields as DB010 ``raw`` (per 100 g/ml when available)."""
    nut = record.get("nutriments") if isinstance(record.get("nutriments"), dict) else {}
    merged: Dict[str, Any] = dict(record)
    for k, v in nut.items():
        merged[k] = v

    def first(keys: Sequence[str]) -> Optional[float]:
        for k in keys:
            if k in merged:
                f = _to_float(merged.get(k))
                if f is not None:
                    return f
        return None

    sugars = first(["sugars_100g", "sugars", "sugars_value"])
    protein = first(["proteins_100g", "proteins", "proteins_value"])
    fat = first(["fat_100g", "fat", "fat_value"])
    sat_fat = first(
        ["saturated-fat_100g", "saturated-fat", "saturated-fat_value", "saturated_fat_100g"]
    )
    fibre = first(["fiber_100g", "fiber", "fiber_value", "fibre_100g", "fibre"])
    sodium = first(["sodium_100g", "sodium", "sodium_value"])
    if sodium is not None and sodium > 100:
        sodium = sodium / 1000.0
    salt = first(["salt_100g", "salt", "salt_value"])
    if sodium is None and salt is not None:
        sv = salt
        if sv > 100:
            sv = sv / 1000.0
        sodium = sv * 0.393

    energy = first(["energy-kcal_100g", "energy-kcal_100g_value", "energy-kcal"])
    if energy is None:
        ev = first(["energy_100g", "energy_100g_value", "energy"])
        if ev is not None:
            unit = str(merged.get("energy_unit") or merged.get("energy-kcal_unit") or "").lower()
            if "kcal" in unit:
                energy = ev
            else:
                try:
                    energy = ev / 4.184
                except Exception:
                    energy = None

    return {
        "sugars": sugars,
        "protein": protein,
        "fat": fat,
        "satFat": sat_fat,
        "fibre": fibre,
        "sodium": sodium,
        "energyKcalPer100": energy,
    }


# Rough scale to ~[0,1] for distance (aligned with DB010 high/moderate bands)
_NORM = {
    "sugars": 50.0,
    "protein": 30.0,
    "fat": 35.0,
    "satFat": 15.0,
    "fibre": 15.0,
    "sodium": 1.5,
    "energyKcalPer100": 500.0,
}


def _norm_dim(key: str, val: float) -> float:
    cap = _NORM.get(key, 1.0)
    try:
        return max(0.0, min(1.0, float(val) / cap))
    except Exception:
        return 0.5


def nutrient_distance(a: Dict[str, Optional[float]], b: Dict[str, Optional[float]]) -> float:
    """Root-mean-square distance on dimensions where **both** sides have values."""
    diffs: List[float] = []
    for k in _NORM:
        va, vb = a.get(k), b.get(k)
        if va is None or vb is None:
            continue
        diffs.append((_norm_dim(k, va) - _norm_dim(k, vb)) ** 2)
    if not diffs:
        return 1.0
    return float(math.sqrt(sum(diffs) / len(diffs)))


def nutrient_similarity(distance: float) -> float:
    """Map distance to (0,1], higher = more similar."""
    try:
        d = max(0.0, float(distance))
    except Exception:
        d = 1.0
    return float(1.0 / (1.0 + 5.0 * d))


def _effective_health_score(nutrition: Dict[str, Any]) -> Tuple[float, bool, bool]:
    """
    Returns (score_for_ranking, sufficient_data, used_provisional).
    When composite is missing, provisional composite is used for ordering only.
    """
    sufficient = bool(nutrition.get("sufficientDataForScore"))
    comp = nutrition.get("compositeScore")
    prov = nutrition.get("provisionalCompositeScore")
    c = _to_float(comp)
    p = _to_float(prov)
    if sufficient and c is not None:
        return (c, True, False)
    if c is not None:
        return (c, sufficient, False)
    if p is not None:
        return (p, False, True)
    return (0.0, False, True)


def _ensure_nutrition(record: Dict[str, Any]) -> Dict[str, Any]:
    enr = record.setdefault("enrichment", {})
    existing = enr.get("nutrition")
    if isinstance(existing, dict) and (
        existing.get("compositeScore") is not None
        or existing.get("provisionalCompositeScore") is not None
    ):
        return existing
    computed = compute_health_score_for_record(record)
    enr["nutrition"] = computed
    return computed


def _peer_summary(rec: Dict[str, Any], rank: int, similarity: float, distance: float) -> Dict[str, Any]:
    return {
        "barcode": _safe_str(rec.get("barcode")),
        "similarity": round(similarity, 6),
        "nutrientDistance": round(distance, 6),
        "rank": rank,
        "productName": rec.get("productName") if rec.get("productName") is not None else "",
        "brand": rec.get("brand") if rec.get("brand") is not None else "",
    }


def _peer_healthier(
    rec: Dict[str, Any],
    rank: int,
    similarity: float,
    distance: float,
    peer_score: float,
    delta: float,
    *,
    basis: str = "score",
) -> Dict[str, Any]:
    out = _peer_summary(rec, rank, similarity, distance)
    out["healthScore"] = round(peer_score, 4)
    out["healthScoreDelta"] = round(delta, 4)
    if basis != "score":
        out["healthierBasis"] = basis
    return out


def _sample_peers(peer_indices: List[int], max_scan: int, rng: random.Random) -> List[int]:
    if len(peer_indices) <= max_scan:
        return peer_indices
    return rng.sample(peer_indices, max_scan)


def _rng_for_category(category_key: str, rng_seed: int) -> random.Random:
    """Stable seed across Python runs (``hash(str)`` is salted per process)."""
    digest = hashlib.md5(f"{rng_seed}:{category_key}".encode("utf-8")).hexdigest()
    return random.Random(int(digest[:12], 16))


def build_alternatives_for_catalog(
    records: List[Dict[str, Any]],
    *,
    max_similar: int = 5,
    max_healthier: int = 5,
    max_peers_scan: int = 400,
    healthier_min_score_delta: float = 2.0,
    max_nutrient_distance_healthier: float = 0.55,
    healthier_allow_any_score_gain: bool = True,
    healthier_use_sugar_proxy: bool = True,
    healthier_use_fiber_proxy: bool = True,
    rng_seed: int = 20260419,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Mutates records in place with ``enrichment.alternatives``; returns (records, stats)."""
    n = len(records)
    vectors: List[Dict[str, Optional[float]]] = []
    nutrition_blob: List[Dict[str, Any]] = []
    cats: List[str] = []
    scores: List[float] = []
    suff: List[bool] = []
    prov_flag: List[bool] = []

    for rec in records:
        nut = _ensure_nutrition(rec)
        nutrition_blob.append(nut)
        sc, sf, pf = _effective_health_score(nut)
        scores.append(sc)
        suff.append(sf)
        prov_flag.append(pf)
        vectors.append(_nutrient_raw_vector(rec))
        cats.append(_category_key(rec))

    by_cat: Dict[str, List[int]] = {}
    for i, c in enumerate(cats):
        by_cat.setdefault(c, []).append(i)

    stats = {
        "products": n,
        "categories": len(by_cat),
        "empty_similar": 0,
        "empty_healthier": 0,
        "healthier_strict_gap": 0,
        "healthier_any_gain": 0,
        "healthier_sugar_proxy": 0,
        "healthier_fiber_proxy": 0,
    }
    _eps = 1e-6

    for i, rec in enumerate(records):
        ck = cats[i]
        peer_pool = [j for j in by_cat.get(ck, []) if j != i]
        rng = _rng_for_category(ck, rng_seed)
        peers = _sample_peers(peer_pool, max_peers_scan, rng)

        meta_notes: Optional[str] = None
        if not peer_pool:
            meta_notes = "no_peers_in_category"

        dist_list: List[Tuple[float, int]] = []
        for j in peers:
            d = nutrient_distance(vectors[i], vectors[j])
            dist_list.append((d, j))
        dist_list.sort(key=lambda t: (t[0], t[1]))

        similar_out: List[Dict[str, Any]] = []
        for rank, (d, j) in enumerate(dist_list[:max_similar], start=1):
            sim = nutrient_similarity(d)
            similar_out.append(
                _peer_summary(records[j], rank, sim, d)
            )
        if not similar_out:
            stats["empty_similar"] += 1

        src_score = scores[i]
        strict_list: List[Tuple[float, float, int]] = []
        relax_list: List[Tuple[float, float, int]] = []
        for j in peers:
            if j == i:
                continue
            d = nutrient_distance(vectors[i], vectors[j])
            if d > max_nutrient_distance_healthier:
                continue
            pj = scores[j]
            delta = pj - src_score
            if delta >= healthier_min_score_delta - _eps:
                strict_list.append((pj, d, j))
            elif healthier_allow_any_score_gain and delta > _eps:
                relax_list.append((pj, d, j))
        strict_list.sort(key=lambda t: (-t[0], t[1], t[2]))
        relax_list.sort(key=lambda t: (-t[0], t[1], t[2]))

        healthier_out: List[Dict[str, Any]] = []
        healthier_candidates: List[Tuple[float, float, int]] = []
        sel_mode: Optional[str] = None
        if strict_list:
            healthier_candidates = strict_list
            sel_mode = "strict_gap"
            stats["healthier_strict_gap"] += 1
        elif relax_list:
            healthier_candidates = relax_list
            sel_mode = "any_score_gain"
            stats["healthier_any_gain"] += 1
        elif healthier_use_sugar_proxy:
            src_sug = vectors[i].get("sugars")
            sugar_ranked: List[Tuple[float, float, float, int]] = []
            for j in peers:
                if j == i:
                    continue
                d = nutrient_distance(vectors[i], vectors[j])
                if d > max_nutrient_distance_healthier:
                    continue
                ps = vectors[j].get("sugars")
                if src_sug is None or ps is None:
                    continue
                if ps < src_sug - 1e-9:
                    pj = scores[j]
                    sugar_ranked.append((float(ps), float(pj), float(d), j))
            sugar_ranked.sort(key=lambda t: (t[0], -t[1], t[2], t[3]))
            healthier_candidates = [(t[1], t[2], t[3]) for t in sugar_ranked]
            if healthier_candidates:
                sel_mode = "lower_sugar"
                stats["healthier_sugar_proxy"] += 1
        if not healthier_candidates and healthier_use_fiber_proxy:
            src_fib = vectors[i].get("fibre")
            fiber_ranked: List[Tuple[float, float, float, int]] = []
            for j in peers:
                if j == i:
                    continue
                d = nutrient_distance(vectors[i], vectors[j])
                if d > max_nutrient_distance_healthier:
                    continue
                pf = vectors[j].get("fibre")
                if src_fib is None or pf is None:
                    continue
                if pf > src_fib + 1e-9:
                    pj = scores[j]
                    fiber_ranked.append((float(pf), float(pj), float(d), j))
            fiber_ranked.sort(key=lambda t: (-t[0], -t[1], t[2], t[3]))
            healthier_candidates = [(t[1], t[2], t[3]) for t in fiber_ranked]
            if healthier_candidates:
                sel_mode = "higher_fiber"
                stats["healthier_fiber_proxy"] += 1

        for rank, (pj, d, j) in enumerate(healthier_candidates[:max_healthier], start=1):
            sim = nutrient_similarity(d)
            basis = "score"
            if sel_mode == "lower_sugar":
                basis = "lower_sugar"
            elif sel_mode == "higher_fiber":
                basis = "higher_fiber"
            healthier_out.append(
                _peer_healthier(
                    records[j],
                    rank,
                    sim,
                    d,
                    pj,
                    pj - src_score,
                    basis=basis,
                )
            )
        if not healthier_out:
            stats["empty_healthier"] += 1

        src_nut = nutrition_blob[i]
        if src_nut.get("sufficientDataForScore"):
            src_hs = _to_float(src_nut.get("compositeScore"))
        else:
            src_hs = _to_float(src_nut.get("provisionalCompositeScore"))

        rec.setdefault("enrichment", {})
        rec["enrichment"]["alternatives"] = {
            "version": ALT_VERSION,
            "similar": similar_out,
            "healthier": healthier_out,
            "metadata": {
                "categoryKey": ck,
                "peerCount": len(peer_pool),
                "peersScanned": len(peers),
                "sourceHealthScore": round(src_hs, 4) if src_hs is not None else None,
                "sourceSufficientData": bool(src_nut.get("sufficientDataForScore")),
                "usedProvisionalForRanking": bool(prov_flag[i]),
                "healthierSelection": sel_mode,
                "notes": meta_notes,
            },
        }

    return records, stats


def run(input_path: str, output_path: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = config or {}
    max_similar = int(cfg.get("max_similar", 5))
    max_healthier = int(cfg.get("max_healthier", 5))
    max_peers_scan = int(cfg.get("max_peers_scan", 400))
    healthier_min_score_delta = float(cfg.get("healthier_min_score_delta", 2))
    max_nutrient_distance_healthier = float(cfg.get("max_nutrient_distance_healthier", 0.55))
    healthier_allow_any_score_gain = bool(cfg.get("healthier_allow_any_score_gain", True))
    healthier_use_sugar_proxy = bool(cfg.get("healthier_use_sugar_proxy", True))
    healthier_use_fiber_proxy = bool(cfg.get("healthier_use_fiber_proxy", True))
    rng_seed = int(cfg.get("rng_seed", 20260419))
    sidecar = cfg.get("sidecar_index_path")  # repo-relative ok

    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = list(data.values())
    if not isinstance(data, list):
        raise ValueError("Expected a JSON list of product records (or a dict of records)")

    records, stats = build_alternatives_for_catalog(
        data,
        max_similar=max_similar,
        max_healthier=max_healthier,
        max_peers_scan=max_peers_scan,
        healthier_min_score_delta=healthier_min_score_delta,
        max_nutrient_distance_healthier=max_nutrient_distance_healthier,
        healthier_allow_any_score_gain=healthier_allow_any_score_gain,
        healthier_use_sugar_proxy=healthier_use_sugar_proxy,
        healthier_use_fiber_proxy=healthier_use_fiber_proxy,
        rng_seed=rng_seed,
    )

    dry = bool(cfg.get("dry_run"))
    if not dry:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as wf:
            json.dump(records, wf, ensure_ascii=False, indent=2)

    if sidecar and not dry:
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        sidecar_path = sidecar
        if not os.path.isabs(sidecar_path):
            sidecar_path = os.path.join(repo_root, sidecar_path.replace("/", os.sep))
        os.makedirs(os.path.dirname(sidecar_path) or ".", exist_ok=True)
        index: Dict[str, Any] = {}
        for rec in records:
            bc = _safe_str(rec.get("barcode"))
            if not bc:
                continue
            alt = (rec.get("enrichment") or {}).get("alternatives") or {}
            index[bc] = {
                "similar": alt.get("similar") or [],
                "healthier": alt.get("healthier") or [],
            }
        with open(sidecar_path, "w", encoding="utf-8") as sf:
            json.dump(index, sf, ensure_ascii=False, indent=2)
        stats["sidecar_index"] = _repo_relative(repo_root, sidecar_path)
    elif sidecar and dry:
        stats["sidecar_index_skipped_dry_run"] = sidecar

    processed = len(records)
    logger.info(
        "[DB019] alternatives: products=%s categories=%s empty_similar=%s empty_healthier=%s "
        "healthier(strict/any/sugar/fiber)=%s/%s/%s/%s",
        stats.get("products"),
        stats.get("categories"),
        stats.get("empty_similar"),
        stats.get("empty_healthier"),
        stats.get("healthier_strict_gap"),
        stats.get("healthier_any_gain"),
        stats.get("healthier_sugar_proxy"),
        stats.get("healthier_fiber_proxy"),
    )
    print(
        f"[DB019] alternatives mapped: products={stats.get('products')} "
        f"categories={stats.get('categories')} "
        f"no_similar={stats.get('empty_similar')} no_healthier={stats.get('empty_healthier')} "
        f"healthier(strict/any/sugar/fiber)={stats.get('healthier_strict_gap')}/"
        f"{stats.get('healthier_any_gain')}/{stats.get('healthier_sugar_proxy')}/"
        f"{stats.get('healthier_fiber_proxy')}"
    )

    return {
        "processed": processed,
        "failures": 0,
        "module": "db019_alternative_product_mapping",
        "stats": stats,
    }


def _repo_relative(repo_root: str, path: str) -> str:
    ap = os.path.normpath(os.path.abspath(path))
    try:
        rel = os.path.relpath(ap, repo_root)
    except ValueError:
        return ap.replace("\\", "/")
    if rel.startswith(".."):
        return ap.replace("\\", "/")
    return rel.replace("\\", "/")


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="DB019: build alternative mappings for a JSON catalog")
    p.add_argument("--input", required=True, help="Path to enriched JSON array")
    p.add_argument("--output", required=True, help="Output path")
    p.add_argument("--max-peers-scan", type=int, default=400)
    args = p.parse_args()
    run(
        args.input,
        args.output,
        {"max_peers_scan": args.max_peers_scan},
    )
