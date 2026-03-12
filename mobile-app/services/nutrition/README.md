Mood & Health Tagger

This module maps cleaned nutrient fields, categories, and ingredient text to mood and health tags.

Files
- `moodHealthTagger.ts` - TypeScript implementation (for codebase use).
- `moodHealthTagger.js` - JS runtime copy used by the validation runner.
- `moodHealthTagger.tests.js` - Simple test runner for quick checks.

Design
- Inputs: `product` object (clean nutrients per 100g, `ingredients` or `ingredients_text`, categories/tags optional) and optional `nutritionScores` (0..100) produced by the scorer.
- Output: array of `{ tag, reason, confidence }` entries plus a simple list can be derived by mapping.

Core mappings (examples)
- `energyBoost`: caffeine-containing ingredients (coffee, tea, matcha, guarana).
- `focus`: moderate protein + low sugar OR matcha / l-theanine.
- `relax`: chamomile, valerian, lavender, kava.
- `gutHealth`: high fibre OR probiotic/fermented ingredients.
- `weightLoss`: high/moderate protein + low sugar + reasonable energy density (exclusion when high sugar present).
- `heartHealth`: low saturated fat + low sodium OR omega-3 content.
- `bloodSugarFriendly`: low sugar + high fibre.
- `antiInflammatory`: turmeric, ginger, berries, green tea, etc.

Exclusions
- `weightLoss` removed when `highSugar` present.

How to run validation

Node (no TypeScript required):

```
node mobile-app/services/nutrition/validateExamplesRunner.js
```

Run tests:

```
node mobile-app/services/nutrition/moodHealthTagger.tests.js
```

Tuning
- Thresholds are driven by `nutritionThresholds.ts` and can be tuned centrally.
- Ingredient keyword lists are intentionally conservative; expand with normalized ingredient tags for higher precision.
