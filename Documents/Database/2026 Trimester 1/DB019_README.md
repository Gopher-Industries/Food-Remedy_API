# DB019 - Alternative product mapping

## Ticket and handover alignment

**Objective (DB019):** Support **“recommend alternatives”** by mapping **similar** and **healthier** products per item, using **category**, **nutrients**, and **health score**, and **handling missing nutrients and edge cases**. Mappings must be **stored** on enriched products and **exposed** for the recommendation layer (including an optional lightweight index file).

**What this implementation delivers:**

| Requirement | How it is met |
|-------------|----------------|
| Similar / healthier alternatives | `enrichment.alternatives.similar` and `.healthier` on each product after enrich |
| Category | Peers are restricted to the same **category bucket** (`categoryKey` in metadata) |
| Nutrients | **Similarity** uses RMS distance on normalized macros where **both** sides have values; `nutrientDistance` and `similarity` are stored per peer |
| Health score | Uses **DB010** via `compute_health_score_for_record` (`nutrition_enrich`); tiers prefer score gaps, then proxies when scores are flat |
| Store / expose | Primary store: **`database/seeding/products_enriched.json`**; optional **sidecar**: `database/seeding/product_alternatives_index.json` |
| Missing data / edge cases | Provisional scores when data is thin; empty `similar` / `healthier` when no valid peer; `metadata.notes` and counters in pipeline stats |

**Handover note:** This README is the canonical description for Trimester 3 **alternative mapping** in the pipeline. If the written handover names an older script (e.g. a legacy “db024” label in historical metadata), the supported module is **`db019_alternative_product_mapping.py`**.

---

## Module and pipeline placement

| Item | Location |
|------|----------|
| Implementation | `database/pipeline/modules/db019_alternative_product_mapping.py` |
| Pipeline registration | `database/pipeline/pipeline.config.json` → `enrich.modules` (runs **after** allergens, DB009, DB021 so tags and allergens are already on the record) |
| Firestore-oriented schema notes | `database/seeding/schema_definition.json` → `enrichment.subfields.alternatives` |

**ProductDetail / API mapping:** `mapping/map_enriched_to_product_detail.py` targets **ProductDetail v1** and does **not** map the full `enrichment` blob. **`enrichment.alternatives`** is intended for **seeded documents / recommendation services** that read enriched JSON or Firestore fields. Extending the public contract is a separate API/schema change.

---

## Inputs and outputs

**Input:** Path from `pipeline.enrich.input` (e.g. `database/seeding/products_5k_enriched.json`) - a JSON **array** of product records.

**Outputs:**

1. **`pipeline.enrich.output`** (e.g. `database/seeding/products_enriched.json`) - same list with **`enrichment.alternatives`** (and `enrichment.nutrition` filled only if it was missing).
2. **Sidecar** (if `sidecar_index_path` is set): `barcode` → `{ "similar": [...], "healthier": [...] }` for fast lookups without loading the full array.
3. **`database/pipeline/pipeline_run_metadata.json`** - last run metadata (includes DB019 in `stages.enrich` → `modules_run` when enrich runs).
4. **`database/pipeline/pipeline_checkpoints.json`** - stage checkpoints (managed by `run_pipeline.py`, not by DB019 alone).

---

## Behaviour summary

### Category bucket

- **`categoryKey`:** `record["category"]` if non-empty, else first entry in `record["categories"]` (lowercased), else **`__uncategorized__`**.
- Alternatives are chosen only among **other products in the same bucket** (excluding self).

### Similar substitutes

- For each product, peers are ranked by **nutrient distance** (lower is closer). If there are more peers than `max_peers_scan`, a **deterministic subsample** per category (seeded RNG) is used before ranking.
- **`similarity`** is derived from distance (higher = more similar).

### Healthier substitutes (ordered tiers)

1. **`strict_gap`:** peer health score ≥ source + `healthier_min_score_delta` (within `max_nutrient_distance_healthier`).
2. **`any_score_gain`:** any peer with **strictly higher** score than the source (same distance cap), if tier 1 is empty.
3. **`lower_sugar`:** if tiers 1–2 find nobody (common when scores are **tied** on sparse data), peers with **lower sugars (per 100 g)** when **both** sides have sugar - tagged with `healthierBasis: "lower_sugar"`.
4. **`higher_fiber`:** if tier 3 is empty, peers with **higher fibre (per 100 g)** when **both** sides have fibre - `healthierBasis: "higher_fiber"`.

**`metadata.healthierSelection`** records which tier produced the list (`null` if `healthier` is empty).

### Nutrition / health score source

- Reuses **`database.pipeline.modules.nutrition_enrich`**: `compute_health_score_for_record`.
- If `enrichment.nutrition` already has composite or provisional scores, it is **left as-is**; otherwise it is **computed** so ranking is consistent.

---

## Data shape (`enrichment.alternatives`)

```json
{
  "version": 1,
  "similar": [
    {
      "barcode": "...",
      "similarity": 0.93,
      "nutrientDistance": 0.014,
      "rank": 1,
      "productName": "...",
      "brand": "..."
    }
  ],
  "healthier": [
    {
      "barcode": "...",
      "similarity": 0.81,
      "nutrientDistance": 0.044,
      "rank": 1,
      "productName": "...",
      "brand": "...",
      "healthScore": 52.0,
      "healthScoreDelta": 2.0,
      "healthierBasis": "lower_sugar"
    }
  ],
  "metadata": {
    "categoryKey": "snacks",
    "peerCount": 120,
    "peersScanned": 120,
    "sourceHealthScore": 45.0,
    "sourceSufficientData": true,
    "usedProvisionalForRanking": false,
    "healthierSelection": "strict_gap",
    "notes": null
  }
}
```

- **`healthierSelection`:** `strict_gap` | `any_score_gain` | `lower_sugar` | `higher_fiber` | omitted when `healthier` is empty.
- **`notes`:** e.g. `no_peers_in_category` when there are no other products in the bucket.

---

## Configuration (`pipeline.config.json`)

| Key | Role | Typical value |
|-----|------|----------------|
| `max_similar` | Max similar peers returned | `5` |
| `max_healthier` | Max healthier peers returned | `5` |
| `max_peers_scan` | Max peers evaluated per product per category (performance) | `400` |
| `healthier_min_score_delta` | Minimum score advantage for **strict** tier | `2` |
| `max_nutrient_distance_healthier` | Max nutrient distance for a “healthier” candidate | `0.55` |
| `healthier_allow_any_score_gain` | Enable tier 2 | `true` |
| `healthier_use_sugar_proxy` | Enable tier 3 | `true` |
| `healthier_use_fiber_proxy` | Enable tier 4 | `true` |
| `rng_seed` | Base seed for reproducible peer sampling | `20260419` |
| `sidecar_index_path` | Repo-relative path for the barcode index, or omit to skip | `database/seeding/product_alternatives_index.json` |
| `dry_run` | If `true`, skip writing output files (when passed through stage config) | - |

---

## How to run

From the repository root:

```bash
python database/pipeline/run_pipeline.py -c database/pipeline/pipeline.config.json --enrich --no-clean --no-seed --force
```

- **`--force`** forces enrich to run even if checkpoints say it completed.
- Omit **`--no-seed`** if you also want the seed stage.

**Inspect one product’s alternatives:**

```bash
python -c "import json; d=json.load(open('database/seeding/products_enriched.json',encoding='utf-8')); print(json.dumps(d[0].get('enrichment',{}).get('alternatives'), indent=2))"
```

---

## Interpreting log / stats

Example console line:

`[DB019] alternatives mapped: products=5000 categories=71 no_similar=52 no_healthier=1737 healthier(strict/any/sugar/fiber)=0/0/3081/182`

| Field | Meaning |
|-------|---------|
| `no_similar` | Products with **no** similar peer (e.g. alone in category or no usable nutrient overlap). |
| `no_healthier` | Products with an **empty** `healthier` array after all tiers. |
| `strict/any/sugar/fiber` | Count of products whose **`healthier`** list was filled by **strict gap** / **any score gain** / **sugar proxy** / **fibre proxy**. |

When many rows share the **same** health score, **strict** and **any** tiers are often **0**; **sugar** / **fibre** proxies still surface sensible swaps.

---

## Edge cases (summary)

- **Missing nutrients:** Distance uses only dimensions present on **both** products; if none overlap, distance is high and similarity low.
- **Thin health data:** Provisional composite may be used; see `usedProvisionalForRanking` and `sourceSufficientData`.
- **Large `__uncategorized__` buckets:** Sampling caps CPU time; peers may differ between runs only if `max_peers_scan` or seeds change.
- **Empty arrays:** Allowed by design when no peer satisfies constraints; the recommendation UI should handle empty lists.

---

## See also

- DB010 scoring: `database/pipeline/modules/nutrition_enrich.py`
- Enrich stage orchestration: `database/pipeline/stages/enrich_stage.py`
- Pipeline runner: `database/pipeline/run_pipeline.py`
