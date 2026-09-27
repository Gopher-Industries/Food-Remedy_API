# BE069 Jev release evaluation

## Reproduction

From `mobile-app`:

```bash
npm run test:jev-evaluation
```

The command is network-free and prints `BE069_EVALUATION_REPORT` as JSON. `npm run test:jev-evaluation-live` is opt-in, requires `TYPESAFE_API_KEY`, and evaluates only the synthetic fixtures. The live command was **not run** for this PR; no credential was provided. No production profile or child data is used. All product names, identifiers, and profiles in the dataset are synthetic.

Dataset `food-jev-eval-v1` covers dip crackers, a lunchbox treat, commuting breakfast, recipe coating, mild snack, crunchy texture, a familiar shared snack and a portable snack. Each case has a cross-category positive, two plausible same-category distractors, a declared allergen conflict, and a missing-category product. The positive labels are **engineering-provisional**, not human-approved judgments.

The offline and opt-in live evaluators use the same safety-checked comparison helper as the v2 endpoint. It adds eligible retrieved candidates to the deterministic display set before semantic scoring; otherwise the cross-category positives in this dataset would be silently omitted.

## Network-free baseline, 2026-09-26

Pinned versions: catalogue `synthetic-catalogue-v1`, model response fixture `jev-1.13.0`, question set `food-fit-score-v1`, policy `food-composite-v1`. The recorded response fixture assigns high-confidence fit to the intended positive and low fit to distractors. It verifies policy wiring and regression behavior; it is not evidence that the live model will make those judgments.

| Measure | Recorded result | Release interpretation |
| --- | ---: | --- |
| Known conflict recommendations across baseline, assisted and fallback | 0 | Hard gate; remains zero tolerance |
| Candidate recall@2 | 1.00 (8/8) | Synthetic retrieval gate only |
| Deterministic top-1 relevance | 0.00 (0/8) | Provisional labels |
| Recorded semantic top-1 relevance | 1.00 (8/8) | Recorded answers; live measurement pending |
| Deterministic / assisted mean reciprocal rank | 0.333 / 1.000 | Provisional labels |
| Semantic coverage on recorded answers | 1.00 | Live coverage pending |
| Forced-timeout fallback parity | 1.00 (8/8) | Exact baseline order |
| Missing-category evidence cases | 8 | Classified separately from retrieval, Jev and policy failures |
| Recorded model duration | 12 ms per candidate | Fixture value, **not a measured provider latency** |
| Recorded usage | 2,880 input / 192 output tokens | Fixture value, **not measured provider usage** |
| Monetary cost | unavailable | Requires approved provider rates and a live run |

The test snapshots both question wording and policy weights, so changes fail CI until reviewed and the fixture is deliberately updated. It also checks a 500 input-token per-case **fixture** budget and a 4,000 ms per-case **fixture** latency budget; these are regression assertions, not production SLA evidence. Existing evaluator and composite-policy tests separately cover low confidence, incomplete coverage, version mismatch, timeout and green-before-grey ordering.

## Release gates requiring QA and product approval

1. Approve or revise relevance labels and broaden the evaluation set with real catalogue coverage after privacy review. Keep safety conflicts at zero in both deterministic and Jev-assisted output.
2. Agree minimum candidate recall@K, top-1 relevance, semantic coverage, confidence calibration and fallback thresholds on the approved set. Recorded fixture outcomes cannot establish those thresholds.
3. Run the opt-in live command with a locked model and question set, capture aggregate report output, then compare with deterministic baseline. Investigate retrieval, missing evidence, upstream and composition failures separately.
4. Set a provider price reference and request token and monetary budgets; evaluate measured latency and cost against them. The report intentionally emits `estimatedCostUsd: null` until rates are approved.
5. Put the approval reference into the runtime configuration only after sign-off. `JEV_RANKING_ENABLED` remains false by default.

Changing a question, policy weight, model version, or catalogue snapshot requires a new report and explicit approval reference. This PR does not claim QA/product sign-off or production readiness.
