# Nutrition, Mood & Health Tagging Documentation

## Overview
This document explains how quantitative nutrient values and ingredient signals are converted into human‑readable nutrition, mood, and health tags through rule‑based thresholds and tagging logic.

These tags classify products based on normalised nutrient profiles, ingredient patterns, categories, and other enriched data. They provide user-facing insights (e.g., highProtein, energyBoost, gutHealth) and support personalised recommendations and filtering.

## Nutrition Thresholds & Tags
Nutrition tags are derived from normalised values (***per 100g***) in the nutriments object.

### Key Nutrients (*per 100g*) & Thresholds
- **Sugar**  
  - Low: ≤ 5 g  
  - Moderate: > 5 g AND ≤ 15 g
  - High: > 15 g

- **Protein**  
  - Moderate: ≥ 6 g AND < 12 g
  - High: ≥ 12 g 

- **Fat**  
  - Low: ≤ 3 g
  - Moderate: > 3 g AND ≤ 17.5 g
  - High: > 17.5 g

- **Saturated Fat**  
  - Low: ≤ 1.5 g
  - Moderate: > 1.5 g AND ≤ 5 g
  - High: > 5 g

- **Fibre**  
  - Moderate: ≥ 3 g AND < 6 g
  - High: ≥ 6 g

- **Energy (Density)**  
  - Low: ≤ 150 kcal
  - Moderate: > 150 kcal AND ≤ 300 kcal
  - High: > 300 kcal

- **Sodium**  
  - Low: ≤ 0.12 g
  - Moderate: < 0.12 g AND ≤ 0.6 g
  - High: > 0.6 g

### Composite score weights 
(from `compositeWeights` in `mobile-app/services/nutrition/nutritionThresholds.ts`)
- Protein: 0.3  
- Sugar: 0.25  
- Fibre: 0.2  
- Fat: 0.15  
- Sodium: 0.1

### Generated Nutrition Tags
**Sugar**
- `lowSugar` / `moderateSugar` / `highSugar`

**Protein**
- `highProtein` / `moderateProtein`

**Fat**
- `lowFat` / `moderateFat` / `highFat`

**Saturated Fat**
- `lowSaturatedFat` / `moderateSaturatedFat` / `highSaturatedFat`

**Fibre**
- `highFibre` / `moderateFibre`

**Sodium**
- `lowSodium` / `moderateSodium` / `highSodium`

**Energy Density**
- `lowEnergyDensity` / `moderateEnergyDensity` / `highEnergyDensity`

**Composite**
- `balancedNutrition`  
  - requires `compositeScore` ≥ 60  
  - excludes `highSugar` / `highFat` / `highSodium`  


## Mood Tagging Rules
Mood tags are heuristic rules based on *nutrients* and *ingredients* associated with cognitive or emotional effects. 

The *confidence* under each tag is a heuristic score (0–1) indicating how strongly a rule supports a given mood or health tag (which can be used for deduplication and conflict resolution). Also, an internal scaling factor *conf* is used to adjust confidence based on nutrient intensity (e.g., fibre level). 

- **`energyBoost`**  
  - Triggered by caffeine-containing ingredients: 
    - `coffee`, `caffeine`, `espresso`, `guarana`, `yerba mate`, `matcha`, `green tea`, `tea`  
  - Confidence: 0.95
  - Rationale: 
    - Caffeine is a well-known stimulant that supports alertness levels.

- **`focus`**  
  - Triggered by:  
    - moderate protein (≥ 6 g/100g) AND low sugar (≤ 5 g/100g)  
    - OR `matcha` / `L-theanine`  
  - Confidence: 0.75
  - Rationale: 
    - Balanced protein and low sugar provides steady energy without crashes.
    - Matcha/L-theanine supports concentration.

- **`relax`**  
  - Triggered by calming herbal ingredients: 
    - `chamomile`, `valerian`, `lavender`, `kava`  
  - Confidence: 0.8
  - Rationale: 
    - These herbs are associated with relaxation and stress reduction.

## Health Tagging Rules
Health tags are inferred from *nutrient* patterns and *ingredient* signals that indicate potential functional benefits. Each rule combines quantitative thresholds with qualitative cues to produce tags.

- **`gutHealth`**  
  - Triggered by:  
    - moderate or high fibre (≥ 3 g/100g)
    - OR fermented/probiotic ingredients:
        - `probiotic`, `fermented`, `kefir`, `yoghurt`, `sauerkraut`, `kimchi`, `inulin`  
  - Confidence: 0.6 + (conf * 0.4)
  - Rationale: 
    - Fibre supports gut microbiota. 
    - Probiotics/fermented foods promote digestive health.

- **`weightLoss`**  
  - Triggered by:  
    - moderate or high protein (≥ 6 g/100g)  
    - low sugar (≤ 5 g/100g)  
    - reasonable energy density (≤ moderate threshold, 300 kcal/100g)  
  - Confidence: 0.7
  - Rationale: High protein and low sugar/energy supports satiety and calorie control.
  
- **`heartHealth`**  
  - Triggered by:  
    - moderate or low saturated fat (≤ 5 g/100g) AND moderate or low sodium (≤ 0.6 g/100g)  
    - OR omega-3 ingredients (`omega-3`, `fish oil`, `flaxseed`, `chia`)  
  - Confidence: 0.6 (nutrient-based) / 0.85 (omega-3)
  - Rationale: 
    - Low saturated fat/sodium reduces cardiovascular risk
    - Omega-3 supports heart function.

- **`bloodSugarFriendly`**  
  - Triggered by: low sugar (≤ 5 g/100g) AND moderate or high fibre (≥ 3 g/100g)  
  - Confidence: 0.75
  - Rationale: 
    - Low sugar and good fibre slows glucose absorption.

- **`antiInflammatory`**  
  - Triggered by: 
    - `turmeric`, `curcumin`, `ginger`, `berries`, `green tea`  
  - Confidence: 0.6
  - Rationale:
    - These ingredients contain compounds with anti-inflammatory properties

## Conflict & Exclusion Rules
The rules are referencing on `TAG_PRIORITY` and `CONFLICT_MAP` in `utils/conflict_resolver.py`.

- High sugar removes `weightLoss` and `bloodSugarFriendly`  
- High saturated fat removes `heartHealth`  
- High fat removes `weightLoss`  
- Uses conflict resolution in `mobile-app/services/nutrition/conflictResolver.js`:  
  - Priority table (e.g., `allergen` = 100, `heartHealth`/`gutHealth`/`weightLoss` = 80)  
  - Explicit conflict map (e.g., `highSugar` conflicts with `weightLoss`, `balancedNutrition`)  
  - Contradictions resolved by keeping tag with higher priority
- No tags is added or removed based on missing nutrient or ingredient data.

## Examples
1. **Coffee**
- **Input:** instant coffee with (only < 3%) sugar  
- **Output:** `energyBoost`, `lowSugar`  
- **Explanation:** Caffeine triggers *energyBoost*; sugar ≤ 5 g/100g yields *lowSugar*.

2. **Rolled Oats**
- **Input:** rolled oats  
- **Output:** `moderateProtein`, `gutHealth`, `weightLoss`, `lowSugar`, `balancedNutrition`  
- **Explanation:** Oats provide moderate protein, low sugar, and high fibre for *gutHealth*; moderated protein, low sugar and reasonable energy density trigger *weightLoss*; the absence of high‑risk tags triggers *balancedNutrition*.

3. **Milk Chocolate**
- **Input:** sugar, cocoa butter, milk powder  
- **Output:** `highSugar`, `highFat`  
- **Explanation:** Sugar > 15 g/100g produces *highSugar*; cocoa butter contributes to *highFat*; high sugar and low protein prevent *weightLoss*.

4. **Canned Tuna**
- **Input:** tuna, olive oil, salt (assumed no carbs)
- **Output:** `ketoFriendly`, `diabeticFriendly`, `dairyFree`, `glutenFree`  
- **Explanation:** Pure protein and fat with no carbs supports *ketoFriendly* and *diabeticFriendly*; the absence of dairy and gluten ingredients supports *dairyFree* and *glutenFree*.


5. **Probiotic Yogurt**
- **Input:** milk, live cultures  
- **Output:** `gutHealth`, `heartHealth` (if low saturated fat and low sodium), `lowSugar` (if sugar ≤ 5 g/100g), `balancedNutrition`  
- **Explanation:** Fermented cultures trigger *gutHealth*; low saturated fat and low sodium allow *heartHealth*; low sugar supports *lowSugar*; overall nutrient balance yields *balancedNutrition*.

## Next Steps
- Thresholds are subject to changes based on future research or regulation revision  
- May add confidence scores or source references for each tag as more solid ground
