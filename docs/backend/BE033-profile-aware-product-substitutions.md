# BE033 - Profile-aware product substitutions

## Outcome

BE033 joins the DB019 candidate map, BE022-compatible allergen decisions and the authenticated active profile into one scan flow. The product **Compare** tab now calls `POST /api/v1/scan/substitutions`; the local scan pipeline uses the same substitution engine and no longer contains fixed chocolate products.

This feature suggests category-equivalent packaged products. It does not assert medical safety, retailer availability, price, sponsorship or meal-plan suitability.

## Child-ticket delivery map

| Child scope | Completion evidence |
| --- | --- |
| BE034 - contract and safety policy | `contracts/substitution_v1.schema.json`; fail-closed rules in `substitutions/allergenSafety.js` |
| BE035 - candidate retrieval | DB019-first, deepest-shared-category retrieval in `substitutions/productCatalog.js`; source and candidate bounds |
| BE036 - profile constraints and ranking | `substitutions/substitutionService.js`; allergen, diet, additive and measurable health-goal checks |
| BE037 - authenticated endpoint | Firebase ID-token middleware, ownership-checked Firestore profile read, rate limit and 16 KB body limit |
| BE038 - scan integration | Compare tab and typed client in `mobile-app`; legacy `scanPipeline.js` delegates to the same engine |
| BE039 - quality, observability and rollout | Structured completion/failure logs, response counters, deterministic rollout percentage and kill switches |

Ticket workflow state and PR links still need to be updated in the team's ticketing/GitHub systems after review; this branch has intentionally not been pushed.

## Canonical API

`POST /api/v1/scan/substitutions`

Headers:

```http
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
X-Request-Id: optional-client-correlation-id
```

Request (maximum body size 16 KB):

```json
{
  "barcode": "9310232957876",
  "profileId": "selected-profile-id",
  "limit": 5
}
```

The server validates the Firebase token and loads `USERS/{uid}/PROFILES/{profileId}` using that token. It never trusts a client-supplied profile. `limit` is restricted to 1-10, at most 60 candidates are evaluated, and each authenticated user is limited to 30 requests per minute per process.

The response is defined by `contracts/substitution_v1.schema.json`. Empty results are successful and explicit, using codes such as `INSUFFICIENT_CATEGORY_DATA`, `INSUFFICIENT_SAFETY_DATA` and `NO_SAFE_SUBSTITUTES`.

## Safety and relevance policy

1. The source must exist and have a specific category. Missing inputs return a safe empty state.
2. DB019 `healthier` and `similar` candidates are considered first. Category-index candidates fill the bounded pool.
3. A returned candidate must share the deepest source category that has a peer. Broad `food`, `grocery` and `meal` labels cannot establish relevance.
4. Known allergen or trace conflicts are excluded using the BE022 canonical alias policy. When the profile has allergen/intolerance restrictions, incomplete declarations and positive-only restrictions resolve to unknown and are excluded.
5. Vegan and vegetarian profiles require positive label/tag evidence. Gluten-free is evaluated through the canonical gluten restriction. Unsupported dietary requirements fail closed.
6. Selected additives are hard exclusions. Missing additive declarations fail closed when additive avoidance is active.
7. Health goals only use comparable per-100 g evidence: lower energy/sugar for weight loss, higher protein for muscle gain, lower sodium for heart/lower-sodium goals and lower sugar for lower-sugar goals. A candidate without measurable improvement is excluded. These are preference signals, not medical claims.
8. Every result includes stable reason codes, a plain-language explanation and the evidence used. The UI reminds users to check the package.

## Observability and quality measures

The backend emits JSON log events without profile health details:

- `substitution.completed`: request ID, source barcode, candidate/evaluated/returned counts, exclusion counts, empty reason and duration.
- `substitution.failed`: request ID and normalized failure code.
- `substitution.auth_rejected`: rejected token reason without logging the token.

Release monitoring should track empty-result reasons, returned-result rate, category/conflict regression failures, p50/p95 duration, 5xx responses and 429 responses. Category leakage and known-conflict recommendation failures are release blockers with a target of zero.

## Configuration

Backend:

```env
FIREBASE_PROJECT_ID=foodremedy-deakin
SUBSTITUTIONS_ENABLED=true
SUBSTITUTIONS_ROLLOUT_PERCENT=10
PORT=3000
```

The runtime must reach Google's Firebase signing-certificate and Firestore REST endpoints. It uses application-user Firebase credentials and does not require a service-account key.

Mobile:

```env
EXPO_PUBLIC_API_BASE_URL=https://backend.example
EXPO_PUBLIC_SUBSTITUTIONS_ENABLED=true
```

## Release plan

1. Deploy backend with `SUBSTITUTIONS_ENABLED=false`; verify health, Firebase project ID and outbound Google access.
2. Run `npm run test:be033`, the focused mobile suites and TypeScript check against the release commit.
3. Enable 5% deterministic rollout, monitor empty reasons, latency and errors for at least one normal traffic window.
4. Increase to 25%, 50% and 100% only while conflict/category regression signals remain zero and operational thresholds stay healthy.
5. Release the mobile Compare tab after the backend is deployed. The mobile feature flag is a second kill switch.
6. Demonstrate bread/cereal, eggs, jam and milk scans with unrestricted, allergen, vegan, additive, goal, incomplete and no-result profiles.

## Rollback plan

1. Set backend `SUBSTITUTIONS_ENABLED=false` (fastest rollback) or `SUBSTITUTIONS_ROLLOUT_PERCENT=0`; requests return a controlled unavailable state and never fall back to unchecked products.
2. Set `EXPO_PUBLIC_SUBSTITUTIONS_ENABLED=false` in the next mobile configuration/build if the Compare entry point also needs removal.
3. Roll back the backend deployment to the prior artifact if errors are not flag-contained. No data migration is required because the feature only reads product/profile data.
4. Preserve request IDs and structured logs for incident analysis. Re-enable from 5% after adding a regression test for the defect.

## Validation

```powershell
npm run test:be033
cd mobile-app
npx jest --runInBand __tests__/substitutionsApi.test.ts __tests__/recommendationsAllergenSafety.test.ts __tests__/activeScanAllergenSuitability.test.ts __tests__/canonicalAllergenSafety.test.ts
npx tsc --noEmit --pretty false
```

The local catalogue smoke demonstration uses real seeded data and returns category-specific products (for example Lite Milk -> Vitasoy Soy Milk Calci-Plus), while incomplete source/category records return an explicit empty state.

## Separate existing defect/risk

`firestore.rules` currently grants blanket read/write access. BE033 still authenticates the endpoint and scopes the profile path to the verified UID, but production Firestore rules should be restricted under a separate security ticket before launch. The rules were not changed here because that is an unrelated, broader authorization redesign.

The pre-existing local scan pipeline also lacked the closing brace for its CLI-only block, preventing the module from loading. BE033 adds that closure because it is required to validate the changed scan path; no other CLI behavior was changed.
