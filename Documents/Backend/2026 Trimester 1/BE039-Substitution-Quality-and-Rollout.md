# BE039 — Product Substitution Quality, Observability and Controlled Rollout

## Approved evaluation set and release gates

The synthetic evaluation set is [substitutionQualityEvaluationFixtures.ts](../../../mobile-app/__tests__/fixtures/substitutionQualityEvaluationFixtures.ts). It covers direct milk conflict, seafood trace conflict, avoided additive, mandatory vegan label, category relevance, and missing category data. It contains no production product, user, profile, or allergy data.

The `substitutionQualityEvaluation.test.ts` suite enforces these release gates:

| Measure | Gate | Current fixture result |
| --- | ---: | ---: |
| Known-conflict recommendation rate | 0% | 0% |
| Category relevance among returned cases | >= 95% | 100% |
| Result coverage | >= 75% | 75% |
| Empty-result rate | <= 25% | 25% |
| Ranking latency (50 fixture runs) | < 50 ms/run | Enforced by test |

The suite is a release gate, not a medical-safety claim. The test must pass before enabling a wider rollout.

## Operational metric events

`POST /api/recommendations/substitutions` emits one structured `product_substitution` event per request through `ConsoleSubstitutionMetrics`. The event has only:

- outcome and duration in milliseconds;
- result count and empty-state reason;
- candidate, eligibility, exclusion, and category-data aggregate counts; and
- reason-code frequency counts.

It must never include a user ID, barcode, profile ID, profile field, matched restriction, raw allergy value, request body, exception message, or product name. The `substitutionObservability.test.ts` privacy test protects this contract.

Create the **Product substitutions v1** dashboard from these event fields with panels for request outcome, p50/p95 duration, result count, empty-state rate, filtering outcome, data-quality failure count, and reason-code distribution. Backend owns event delivery and alert routing; QA owns the evaluation fixture; product owns the gate values and rollout approval; mobile owns the user-facing unavailable and empty states.

## Alerts and incident response

Evaluate rolling 15-minute windows after at least 100 requests. Alert the backend on:

| Signal | Warning | Critical / action |
| --- | ---: | --- |
| `unavailable` outcomes | > 2% | > 5%; set rollout to `disabled` and investigate Firestore/auth availability |
| Empty results | > 35% | > 50%; pause rollout expansion and inspect category/data-quality counts |
| p95 duration | > 2 s | > 3.5 s; set rollout to `disabled` if sustained for 15 minutes |
| Category data failures | > 10% | > 20%; pause rollout and raise a catalogue-quality incident |
| Evaluation conflict rate | > 0% | Any non-zero result blocks release and requires immediate rollback |

Incident owner: backend on-call. First capture aggregate metric windows, disable the feature when a critical threshold is crossed, then preserve the fixture and release version for QA reproduction. Do not query or attach user profiles, raw allergies, or request bodies to the incident.

## Rollout and rollback

The route evaluates `SUBSTITUTIONS_ROLLOUT` for every request:

| Setting | Behaviour |
| --- | --- |
| `enabled` | All authenticated requests are served. |
| unset or `disabled` | All requests return the sanitized unavailable envelope before product/profile reads. |
| `canary` | `SUBSTITUTIONS_CANARY_PERCENT` (0–100) selects a stable in-memory cohort using a salted hash. The user ID is never persisted or emitted. |

Set `SUBSTITUTIONS_ROLLOUT=disabled` in runtime configuration to roll back without changing application code or deploying unrelated functionality. Re-enable at 5%, 25%, 50%, then 100% only after each 15-minute window meets the gates. Exercise the disabled path before release and record the result in the release checklist.

## Known limitations

- Console metrics require the deployment platform’s structured-log export to back the dashboard and alerts.
- Category candidate retrieval is limited to catalogue category tags; sparse tags can correctly produce an empty state.
- The safety gate identifies known conflicts and insufficient evidence but does not make a medical-safety claim.
