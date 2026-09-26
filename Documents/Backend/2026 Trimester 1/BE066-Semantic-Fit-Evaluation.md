# BE066 — Versioned Jev semantic-fit evaluation

The `food-semantic-state-v1` builder sends only the original and candidate
names, meaningful categories, validated semantic attribute values, a bounded
shopping intention, and explicit/observed preference summaries. It omits
barcodes, UID/profile identifiers, labels, ingredients, allergens, traces,
additives, nutrients, dietary restrictions and raw event history. Intentions
that appear to state medical or dietary restrictions are withheld from the
model state; the deterministic safety profile remains the only safety source.

The `food-fit-score-v1` question set uses four concrete levels (0–3) for each
dimension. One System One call batches all applicable independent questions
for a candidate. The same questions and `score / 3` normalization apply across
its shortlist. The three base dimensions are:

| Dimension | Low end of rubric | High end of rubric |
| --- | --- | --- |
| Functional fit | Cannot serve the original food role | Serves it with little change |
| Occasion fit | Impractical in the stated setting | Fits the occasion naturally |
| Convenience fit | Incompatible preparation or handling | Meets the requested handling need |

`preference_fit` is added only when explicit or observed preference evidence
exists. `familiarity_fit` is added only for an explicit familiarity preference.
Each has equally concrete conflict-to-match levels in source. Otherwise the
dimension is `not_applied`; acceptance likelihood is always `not_applied` at
this stage because household outcome evidence has not been calibrated.

`evaluateSemanticShortlist` rechecks deterministic safety eligibility before
any call, evaluates at most 20 candidates with two concurrent calls, and
returns typed per-dimension raw Score, normalized score, confidence and raw
probabilities, plus the model ID, state/question versions, token usage and
latency. These remain server internal. Jev never supplies public medical
explanations, candidate inclusion, or safety decisions. Composite ranking and
confidence thresholds are BE067's separate policy.

The synthetic fixtures cover crackers and rice cakes, a lunchbox treat,
commuting breakfast, and a recipe coating replacement. The network-free suite
checks redaction, a known allergen conflict excluded before the mock client,
batched question identity, skipped optional dimensions, score normalization,
and a concurrency peak of two. The mock response's functional score of 2.3/3
normalizes to 0.767 (rounded here for display); its probabilities and 0.85
confidence remain in the internal result.

```sh
npm --prefix mobile-app test -- --runInBand --silent semanticFitEvaluator.test.ts
RUN_TYPESAFE_LIVE=1 TYPESAFE_API_KEY='<server credential>' \
  npm --prefix mobile-app run test:semantic-live
```

The live command evaluates one synthetic, safety-eligible candidate and prints
only model/version, dimension names, latency and token count. It was not run
here because no TypeSafe credential was available. Ordinary CI skips the live
test and makes no external request.
