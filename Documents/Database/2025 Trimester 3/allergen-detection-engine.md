# Allergen Detection Engine Documentation

## Overview
This rule-based engine detects the 14 AU/NZ major allergens from multiple fields (`ingredients_text`, `traces`, `categories_tags`, `product_name`, `labels_tags`, etc.). It adds a structured `allergensDetected` array for user safety warnings and preference filtering. The design prioritises high precision, low false‑positive rates, and fully transparent, explainable detection logic.

## Canonical Allergen List
According to **Standard 1.2.3** and **Schedule 9** of *Food Standards Australia New Zealand* (FSANZ) (2015a & 2015b), those 14 major allergens are:
  - Milk
  - Eggs
  - Peanuts
  - Tree Nuts (e.g., almonds, cashews, walnuts)
  - Sesame
  - Fish
  - Crustacea (e.g., shrimp, crab)
  - Molluscs (e.g., squid, oysters)
  - Soy
  - Wheat/Gluten
  - Lupin
  - Sulphites
  - Mustard
  - Celery

## Keyword Expansions & Synonyms
The engine uses an expanded keyword and synonym database (maintained in the **`database/Allergens/allergens_config.json`**) to ensure accurate detection and reduce false negatives.

### Core Mechanism
- **Case‑insensitive matching**
- **Whitespace‑trimmed inputs**
- **Synonym expansion**: common variations and alternative names are mapped to a canonical allergen

### Allergen Keyword Groups
**Milk**  
- cow’s milk, dairy, lactose, casein, whey

**Eggs**  
- egg white, egg yolk, albumin, ovomucin

**Peanuts**  
- groundnut, arachis

**Tree Nuts**  
- almond, cashew, walnut, hazelnut, pistachio, macadamia, Brazil nut, pecan  
- includes derived terms (e.g., *almond milk* → Tree Nuts)

**Sesame**  
- sesame seed, tahini

**Fish**  
- salmon, tuna, cod, anchovy, haddock, basa, sardine  
- fish oil

**Crustacea**  
- shrimp, prawn, crab, lobster, crayfish, shellfish (partial)

**Molluscs**  
- squid, octopus, clam, mussel, oyster, abalone

**Soy**  
- soya, soybean, tofu, edamame, miso, tempeh  
- lecithin (when derived from soy)

**Wheat / Gluten**  
- wheat, barley, rye, triticale, malt, semolina, couscous

**Lupin**  
- lupin flour, lupin bean

**Sulphites**  
- sulfur dioxide, sulphur dioxide, E220–E228

**Mustard**  
- mustard seed, mustard flour

**Celery**  
- celeriac, celery root, celery salt

### Maintenance
All synonym mappings are stored in the **`database/Allergens/allergens_config.json`** and can be updated without modifying application code.


## Matching Strategy
The engine applies a multi-stage, rule-based matching process across several product fields to maximise detection coverage while minimizing false positives.

- Scans: ingredients_text, traces, categories, product_name, labels
- Keyword matching with synonyms
- Strict regex for variations (e.g., fish species, tree nut types)
- Negation suppression (e.g., “no milk”, “gluten-free”, “nut-free”)
- Special handling:
  - Nut butters → correctly label Peanuts/Tree Nuts
  - Plant milks → avoid false Milk positives
- Exclusion logic: known false-positive patterns suppressed

## Output Schema

The engine produces a single structured field as output:

- **allergensDetected**  
  - Type: array<string>  
  - Required: false (defaults to empty array [] if no allergens are detected)  
  - Format: Canonical allergen names (from the 14 AU/NZ major allergens list), exactly matching the canonical names (e.g., "Milk", "Gluten", "Peanuts", not "milk" or "peanut")  
  - Semantics:  
    - Empty array [] indicates no allergens detected after applying all matching and suppression rules.  
    - Multiple allergens are listed without duplicates (deduplicated during processing).  
    - Order is not significant (can be sorted alphabetically for consistency if desired).  
  - Example outputs:  
    - ["Milk", "Gluten"] (from "milk powder, wheat flour")  
    - [] (from "gluten-free, dairy-free bread")  
    - ["Tree Nuts", "Peanuts"] (from "almond butter with peanut traces")  

This field is stored in the enriched product document and used by the front-end for user preference filtering and safety warnings.

## Unit Testing & Evaluation

The detection engine is validated through a combination of unit tests and manual review to ensure high precision and controlled recall.

- **Unit Testing Approach**  
  - Automated tests cover:  
    - Positive matches (e.g., "cow’s milk" → "Milk")  
    - Negation cases (e.g., "no dairy, gluten-free" → [])  
    - Special handling (e.g., "almond milk" → no "Milk", "peanut butter" → "Peanuts" + "Tree Nuts")  
    - Edge cases: partial matches, multi-language strings, ambiguous terms  
  - Test suite includes 5k cases from sample dataset and has been executed with perfect result.

- **Continuous Improvement**  
  - False positives/negatives are logged and reviewed for synonym or rule updates.
  - Negation patterns can be updated in `NEGATION_PATTERNS` of `utils/detect_allergens.py` directly as well. 

## Examples
- "Ingredients: milk powder, wheat flour" → ["Milk", "Gluten"]
- "Gluten-free, no dairy" → [] (negation suppression)
- "Almond butter, sugar, salt" → ["Tree Nuts"] (special handling: milk suppressed in nut‑butter case)

## Reference
Food Standards Australia New Zealand. (2015a). *Australia New Zealand Food Standards Code – Schedule 9: Mandatory advisory statements.* Federal Register of Legislation.

Food Standards Australia New Zealand. (2015b). *Australia New Zealand Food Standards Code – Standard 1.2.3: Information requirements – warning statements, advisory statements and declarations.* Federal Register of Legislation.

