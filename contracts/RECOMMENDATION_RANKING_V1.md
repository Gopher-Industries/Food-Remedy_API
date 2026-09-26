# Recommendation Eligibility and Ranking (v1.0.0)

This document defines the deterministic implementation of the BE034 policy for product substitutions. It is consumed server-side by BE037; it does not make a medical-safety claim.

## Hard gates

A candidate is excluded before scoring when it has a canonical allergen or trace conflict, an avoided additive, or fails a mandatory dietary restriction. Canonical allergen matching uses `services/allergenSafety.ts` and its shared taxonomy.

When an active allergy or intolerance cannot be evaluated from complete allergen and trace declarations, the candidate is excluded. With no active allergen or intolerance restriction, incomplete declarations may be returned only with a `grey` rating and `ALLERGEN_EVIDENCE_INCOMPLETE`. A mandatory diet is accepted only with its explicit product label; unsupported mandatory diet labels fail closed.

The original product needs category evidence. Candidates missing category evidence are excluded. There is no fallback that puts excluded products back into a response.

## Scores and order

Each eligible candidate has a score from 0 to 100. Scores use only catalogue evidence:

| Evidence | Points |
| --- | ---: |
| Exact category match | 30 |
| Related category match | 20 |
| Complete, non-conflicting allergen evidence | 25 |
| One or more mandatory diet labels | 10 |
| Better Nutri-Score | 10 |
| Each nutrient improvement: sugar, sodium, saturated fat, fibre, protein | 3 |
| Weight-loss calorie improvement or muscle-gain protein improvement | 10 |

`green` candidates sort before `grey` caution candidates, then by descending score, then by canonical barcode ascending. Input order cannot change the result. One barcode is returned once, and the module caps candidate processing at 200 and results at 20.

## Result evidence

Every returned candidate carries only standard reason codes and generic explanations. The output does not include profile allergies, additives, matched restrictions, or product-input diagnostics. The reason-code catalogue defines the stable public meanings.
