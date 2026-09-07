# DB031 – Investigate Product Category Consistency

**Ticket ID:** DB031
**Status:** Complete (Investigation + one low-risk improvement)
**Target Application:** Food Remedy Mobile Application / Food Remedy API
**Scope:** Investigate missing, unclear, or inconsistent product categories in the current dataset; review existing category harmonisation behaviour; implement one low-risk improvement; test.

---

## 1. Executive Summary

This investigation reviewed how raw Open Food Facts category data becomes the single harmonised `category` / `standardCategory` field consumed by the mobile app, using `database/seeding/products_5k_test.json` (5,000 raw products) as the sample and `database/clean_data/cleanProductData.py` as the current implementation (documented in `database/clean_data/CATEGORY_TAG_RULES.md`, tickets DB004/DB017).

**Key finding:** before this ticket, **96.6% of the 5,000-product sample resolved to `"other"`**, split between two very different causes — genuinely missing data (90.5% of products have an empty `categories` array) and unmapped-but-present data (a further ~6% have category tags, just none the harmoniser recognises).

**One low-risk fix implemented:** added a new `dairy` bucket to `CATEGORY_RULES_ORDERED`, covering `dairies`, `cheeses`, `yogurts`, `fermented-milk-products`, and `fermented-dairy-desserts` — the single largest unmapped-but-unambiguous cluster found. This is purely additive: it does not reorder, remove, or alter any existing rule, and testing confirms zero change to any product that previously classified correctly.

---

## 2. Detailed Findings

### 2.1 Missing categories

The harmoniser (`CATEGORY_RULES_ORDERED` in `cleanProductData.py`) only recognises **8 buckets**: `meal kits`, `breads`, `noodles and pasta`, `seafood`, `oils`, `spreads`, `beverages`, `snacks and confectionery`. Any product outside these falls to `"other"`, regardless of how much genuine category data it has.

Common, frequent, unambiguous raw tags with **no matching rule at all** (counts from the 5,000-product sample):

| Raw tag | Occurrences | Suggested bucket |
|---|---|---|
| `dairies` | 66 | dairy *(now added)* |
| `cereals-and-potatoes` | 64 | cereals / staples |
| `fermented-milk-products` | 53 | dairy *(now added)* |
| `cereals-and-their-products` | 42 | cereals / staples |
| `desserts` | 32 | desserts |
| `breakfast-cereals` | 31 | cereals / staples |
| `condiments` | 27 | condiments |
| `cheeses` | 26 | dairy *(now added)* |
| `dairy-desserts` | 25 | dairy / desserts |
| `fermented-dairy-desserts` | 24 | dairy *(now added)* |
| `yogurts` | 24 | dairy *(now added)* |

### 2.2 Empty category values

Of the 5,000 raw products:

- **4,523 (90.5%)** have an empty `categories` array — no category data supplied at all.
- **0** have `categories` as `None`/missing key (the field is always present as a list; it's just often empty).
- **477 (9.5%)** have one or more populated category tags.

This is the dominant driver of the `"other"` rate and is a data-completeness issue upstream of harmonisation, not a bug in the harmoniser itself.

### 2.3 Similar categories represented differently

- `beverages` (53 occurrences) and `beverages-and-beverages-preparations` (50 occurrences) are two different raw representations of the same concept. Neither matches the current `beverages` rule, because that rule deliberately excludes the bare `beverages` segment (to avoid false-triggering on the umbrella slug `plant-based-foods-and-beverages`) and only lists specific sub-types (`dairy-drinks`, `teas`, `waters`, etc.). This means a product tagged with nothing but the generic `beverages` tag is never classified as `beverages` — a genuine gap, left as a **remaining issue** (see 2.6) rather than fixed here, since correcting it safely requires more care than a single-line addition (the denylist logic would need to be re-verified against the umbrella-slug case).
- Language-prefixed variants (e.g. `en:breads`, `fr:breads`) and case variants (`Breads`, `BREADS`) are already correctly normalised to the same value by `clean_category_tags()` (strips `lang:` prefix, lowercases) — confirmed by test (2.4).

### 2.4 Unclear or overly broad categories

- `"other"` is used as a single catch-all for two distinct situations: (a) no category data was supplied, and (b) category data was supplied but doesn't match any rule. Analytics or filtering built on `category == "other"` cannot currently distinguish "we know nothing" from "we know something but haven't classified it yet." This is flagged as a remaining issue (2.6), not fixed in this ticket, since resolving it requires either a schema change (e.g. a separate `"uncategorised"` vs `"unclassified"` value) or a new field, both of which are beyond "low-risk."
- `snacks and confectionery` is a genuinely broad, deliberately merged bucket (per DB004 design) — this is documented intentional behaviour, not a defect.

### 2.5 Existing category harmonisation behaviour (DB004/DB017)

Confirmed by reading `cleanProductData.py` and by test:

1. `clean_category_tags()` strips `lang:` prefixes and lowercases every raw tag.
2. `standardise_category()` walks `CATEGORY_RULES_ORDERED` **in order** (most specific bucket first) and returns the **first** bucket whose keyword matches a **whole hyphen segment** of any cleaned tag (`_keyword_matches_tag` — not substring matching).
3. A denylist (`BEVERAGE_TAG_DENYLIST`) prevents the umbrella slug `plant-based-foods-and-beverages` from triggering `beverages` on its own.
4. If nothing matches, the product resolves to `"other"`.
5. Because only the *first* matching rule wins, rule **order is significant** when a product has tags spanning two buckets — see 3.3 below.

### 2.6 Remaining category issues after processing

Even after this ticket's fix, the following remain and are recommended as separate follow-up tickets:

- `"other"` still conflates "no data" with "unclassified data" (2.4).
- The bare `beverages` / `beverages-and-beverages-preparations` tags still don't resolve to `beverages` (2.3).
- `cereals-and-potatoes`, `condiments`, and `desserts` remain unmapped, unambiguous clusters not addressed by this single low-risk change (2.1) — deliberately left for a future ticket to keep this change small and reviewable.
- 90.5% empty-category rate is a data-supply problem (likely upstream in the Open Food Facts source data or the scraping/enrichment stage), not something the harmoniser can fix.

---

## 3. Low-Risk Improvement Implemented

### 3.1 Change

Added one new rule to `CATEGORY_RULES_ORDERED` in `database/clean_data/cleanProductData.py`:

```python
("dairy", (
    "dairies", "cheeses", "yogurts",
    "fermented-milk-products", "fermented-dairy-desserts",
)),
```

### 3.2 Why this one

- It is the single largest unmapped-but-unambiguous cluster (66 + 53 + 26 + 24 = 169 tag occurrences in the sample, more than all existing non-"snacks" buckets combined).
- The keywords are unambiguous — no known false-positive risk analogous to the `beverages`/umbrella-slug problem.
- It required a **single added tuple**, no changes to existing rules, denylist, or fallback logic.

### 3.3 Placement (why it matters)

The new rule was placed **after** `beverages` in `CATEGORY_RULES_ORDERED`, not before. Testing showed that placing it *before* `beverages` reclassified 9 products in the sample — drinkable dairy items (milkshakes, kefir, iced coffee) that carry both a dairy tag (`dairies`) and a beverages sub-type tag (`dairy-drinks`) — from `beverages` to `dairy`, changing existing, already-correct behaviour. Placing `dairy` after `beverages` means the first-match-wins order continues to resolve these products to `beverages` exactly as before, and the new rule only catches products beverages doesn't already claim.

### 3.4 Verified impact (5,000-product sample)

| Bucket | Before | After |
|---|---|---|
| other | 4,831 (96.6%) | 4,774 (95.5%) |
| dairy | — | 57 (1.1%) |
| beverages | 23 (0.5%) | 23 (0.5%) — unchanged |
| all other buckets | unchanged | unchanged |

---

## 4. Testing

All tests in `database/test_db031_category_consistency.py` (22 tests, all passing):

- **Valid categories**: existing buckets (`breads`, `seafood`, `noodles and pasta`, `oils`, `spreads`, `snacks and confectionery`) still resolve correctly.
- **Missing / inconsistent categories**: `None`, `[]`, `""`, and unrecognised/junk tags all resolve to `"other"` without raising.
- **Existing harmonisation behaviour**: the umbrella-slug denylist still holds; segment-safe (non-substring) matching still holds; language-prefix and case normalisation still holds.
- **New dairy rule**: `dairies`, `cheeses`, `yogurts`, `fermented-milk-products` each resolve to `dairy`.
- **Valid categories not incorrectly changed**: drinkable dairy products (milkshake, kefir) with mixed dairy + beverage tags still resolve to `beverages`, not `dairy`; a rule-order guard test protects against a future edit silently reintroducing the regression.

Regression check: existing suites `database/test_db033_mapping_correctness.py` and `database/test_db032_barcode.py` (22 tests) were re-run and all still pass — confirming the change is isolated to category harmonisation.

Run all with:

```bash
python -m pytest database/test_db031_category_consistency.py database/test_db033_mapping_correctness.py database/test_db032_barcode.py -v
```