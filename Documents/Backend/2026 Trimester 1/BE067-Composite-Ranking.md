# BE067 — Confidence-gated composite ranking

The v2 endpoint first runs the unchanged deterministic safety and ranking
engine. An optional semantic stage compares at most 20 safety-eligible
candidates, including the deterministic display set and the bounded semantic
shortlist. Each candidate is rechecked through `rankSafeCandidate` before
evaluation. An excluded candidate can neither reach Jev nor re-enter the
response. V1 remains deterministic.

The `food-composite-v1` policy is **provisional and disabled by default**. It
needs the BE069 evaluation and QA/product approval before production enablement.
The server requires both `JEV_RANKING_ENABLED=true` and a nonempty
`JEV_POLICY_APPROVAL_REFERENCE`; no client field can enable it.

| Policy term | Value | Behavior |
| --- | ---: | --- |
| Deterministic weight | 0.55 | Existing score, still distinct from model confidence |
| Semantic weight | 0.45 | Only within safety rating group |
| Functional fit | 0.40 | Applied only if all candidates clear confidence gate |
| Occasion fit | 0.25 | Same coverage rule |
| Convenience fit | 0.20 | Same coverage rule |
| Preference fit | 0.10 | Skipped for all when no preference evidence |
| Familiarity fit | 0.05 | Skipped for all when no familiarity evidence |
| Medium confidence | 0.65 to <0.85 | Contribution moves halfway from neutral 0.5 to Score |
| High confidence | >=0.85 | Full normalized Score contribution |
| Low confidence | <0.65 | Dimension removed for every candidate |

The weights of applicable dimensions are renormalized consistently for all
candidates. Missing, malformed, timed-out or inconsistent candidate results
trigger an all-or-nothing deterministic fallback. If every dimension is
insufficiently confident, the deterministic order is returned. Green always
precedes grey; final ties use barcode order. Changing these display weights
does not rerun Jev because its dimension scores and probabilities stay in the
internal typed evaluation result.

V2 names `deterministicScore`, `semanticScore` and `semanticConfidence`
separately. `semanticScore` and `semanticConfidence` remain null in fallback.
The response includes a typed `rankingReasonCode`: `DETERMINISTIC_BASELINE`,
`SEMANTIC_CONFIDENT` or `SEMANTIC_FALLBACK`. A semantically applied item also
has `SEMANTIC_FIT_APPLIED` in its reason codes. There is no generated prose.
The server-issued feedback session records model, question and policy versions
and scores only when semantic ranking was actually applied.

The mocked regression suite verifies cross-category green reordering,
green-before-grey, barcode ties, medium/low confidence boundaries, partial
failure fallback, unchanged deterministic order when disabled/unavailable,
and allergen conflict exclusion even with high mocked model scores. No live
TypeSafe call is needed. Thresholds are not claimed as calibrated or approved;
BE069 must compare them on the approved evaluation set.
