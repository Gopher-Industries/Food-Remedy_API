# BE030 Meal-Plan Performance and Concurrency Evidence

## Boundaries implemented

| Resource | Bound |
| --- | ---: |
| Request body | 10,000 bytes |
| Candidate products (default / maximum) | 50 / 100 |
| Active classification requests | 4 |
| One classification request | 2 seconds |
| Entire meal-plan request | 12 seconds |

The maximum candidate set is processed in deterministic four-request batches:
`ceil(100 / 4) = 25` batches. No request can create more than four active
classifier fetches, and the overall deadline stops starting further work.

## Regression evidence

`mobile-app/__tests__/mealPlanBounds.test.ts` uses 100 Firestore candidate
documents and fetches that remain pending until the test releases each batch.
It observed `maxActive === 4`, completed all 100 classifications, and verified
that the Firestore query received the requested bounded limit.

The same suite uses fake timers to verify both deadline paths: a slow classifier
is aborted after 2 seconds, while a 25-candidate slow request reaches the
12-second overall deadline before every candidate is started. It also verifies
that client cancellation aborts in-flight classifier fetches.

Run from `mobile-app`:

```bash
npx jest __tests__/mealPlanBounds.test.ts __tests__/mealPlanAllergenSafety.test.ts --runInBand
```

Result on this change: 2 suites passed, 19 tests passed.

## Partial-failure policy

A product is excluded if its classifier fails, returns an invalid payload, or
exceeds its individual deadline. A 200 response is returned when at least one
product was classified, with a stable warning that states how many products
were excluded. If no products can be classified, the route returns the
sanitized `CLASSIFICATION_UNAVAILABLE` response. The overall request deadline
returns the sanitized `REQUEST_TIMEOUT` response instead of a partial plan.
