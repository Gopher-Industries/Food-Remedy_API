# Category & tag harmonisation (DB004 / DB017)

Aligned with **Trimester 3 handover**: category harmonisation, tag consistency, and outputs usable for **Firestore queries** and **Product Detail v1** (`api/contracts/product_v1.json`).

## DB017 — what was implemented

All of the following live in **`database/clean_data/cleanProductData.py`** and run inside **`main()`** after tag columns are cleaned.

| Item | Implementation |
|------|----------------|
| **Tag normalisation** | **`standardise_tags()`** — uses **`clean_category_tags()`** (trim, lower, strip `lang:` prefixes) then **`TAG_MAPPING`** for synonyms; deduplicates. |
| **Conflict / consistency rules** | **`apply_conflict_rules(standard_category, search_tags)`** — returns **`(final_tags, removed_tags)`**; removals are category-specific (e.g. bakery-like tokens on beverages, vegan/vegetarian on seafood, low-fat on oils). |
| **Structured output for apps / contract** | **`tags`**: `{ "final": [...], "removed": [...] }` aligned with **`product_v1`** `tags` (same shape). **`searchTags`** duplicates **`tags.final`** for simple **`array-contains`** queries. |
| **Pipeline order** | `labels_tags` → **`standardise_tags`** → **`apply_conflict_rules`** → build **`tags`**; **`category`** / **`standardCategory`** come from DB004 harmonisation (needed as input to conflict rules). |

**Note:** `tags.removed` is only non-empty when a product’s labels actually trigger a rule; many real rows will show `removed: []`.

## Harmonised primary category (`standardCategory` / `category`) — DB004

- Raw Open Food Facts `categories_tags` are cleaned (language prefix stripped, lowercased).
- A **single** bucket string is assigned using **`CATEGORY_RULES_ORDERED`** in `cleanProductData.py`.
- Rules are evaluated **in order** (more specific buckets before generic ones) to avoid misclassification - e.g. **`breads`** is chosen before drink categories even when the umbrella slug `plant-based-foods-and-beverages` is present.
- Matching uses **whole hyphen segments** (`_keyword_matches_tag`), not naive substring search, so keywords like `beverages` do not match inside unrelated slugs.
- The umbrella slug `plant-based-foods-and-beverages` is on a **denylist** for the **beverages** bucket so it cannot trigger drink classification by segment overlap alone.

## Contract fields (filtering / recommendations)

| Field | Role |
|--------|------|
| `categories` | Normalised OFF slug list (`utils.category_normalizer.normalize_categories`): sorted, deduplicated, prefixes stripped - matches **product_v1** `categories`. |
| `category` | Same value as `standardCategory`: primary bucket for simple filters. |
| `labels` | Label slugs after cleaning. |
| `searchTags` | **Final** label tokens after synonym mapping (legacy flat array for simple `array-contains` queries). |
| `tags` | `{ "final": [...], "removed": [...] }` per **product_v1** - tokens dropped by **conflict rules** appear in `removed` for audit and QA. |

## Tag normalisation

- Trimming, lowercasing, `language:` prefix removal (`clean_category_tags`).
- Synonym map **`TAG_MAPPING`** maps common variants to canonical slugs (extend as needed).

## Conflict / consistency rules (`apply_conflict_rules`)

Implemented in code; extend here and in the same function together:

- **beverages**: remove misleading food-aisle tokens such as `bakery`, `breads`, `cereals` when present on drink products.
- **seafood**: remove `vegan` / `vegetarian` when they contradict animal products.
- **oils**: remove `low-fat` / `fat-free` when inconsistent with oil products.

## Firestore query notes

- **Category filter**: `where("category", "==", "<bucket>")` or `where("standardCategory", "==", ...)` (both set to the same harmonised string).
- **Label / tag filter**: `array-contains` on `searchTags` or `labels`; for full audit use `tags.final` / `tags.removed` in app or admin tooling.

## Optional hierarchy

- OFF hierarchy is preserved in the **order** of raw taxonomy in source data before normalisation; **`categories`** in the API contract is **sorted** for deterministic comparisons. For “path from broad to narrow”, use source pipeline docs or future `categoryPath` if added to the contract.
