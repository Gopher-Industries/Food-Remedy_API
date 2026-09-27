# BE033 – Profile-Aware Product Substitution Handover

## Completion scope

BE033 is completed by the current canonical substitution stack rather than by
introducing another recommendation engine. Its child tickets are present on
`main`:

- BE034: versioned substitution request/response contract.
- BE035: bounded category-relevant Firestore candidate retrieval.
- BE036: fail-closed allergen, trace, dietary-form and avoided-additive gates,
  followed by deterministic nutrition and health-goal ranking.
- BE037: Firebase-token-authenticated endpoint whose UID, profile and safety
  data are server-derived.
- BE039: aggregate-only metrics and disabled/canary/enabled rollout controls.

Later BE058–BE070 work extends that stack with owned household profiles,
explicit personalization context, deterministic semantic fallback and evidence
collection. Those additions do not weaken BE033's hard safety gates.

## Canonical production boundary

`POST /api/recommendations/substitutions` is the sole authenticated substitution
endpoint. The v1 contract selects the account's authoritative profile. The v2
contract accepts an owned `profileId`; ownership and active status are verified
under the authenticated UID. Callers cannot submit allergies, diets, scoring
weights or another user's UID.

Results are bounded to 20 and contain compact product identity, a safety rating,
reason codes and user-facing reason text. Known conflicts are excluded before
ranking. Missing category or safety evidence produces an explicit empty state;
the service never falls back to an unrelated/static catalogue.

## Release plan

1. Deploy the API route with Firebase Admin credentials and production API URL.
2. Keep the mobile `recommendationsTab` flag off during deployment validation.
3. Set server `SUBSTITUTIONS_ROLLOUT=canary`, a private rollout salt and a small
   canary percentage.
4. Verify aggregate success/empty/error counts and representative categories.
5. Increase the canary only after profile ownership, latency and safe-empty
   behaviour are confirmed.
6. Enable the mobile flag only after the BE038 device smoke test passes.

## Rollback plan

Set `SUBSTITUTIONS_ROLLOUT=disabled` to fail closed without a client release.
Keep `EXPO_PUBLIC_FEATURE_RECOMMENDATIONS_TAB=false` to hide the Compare tab.
Do not restore legacy `/scan/alternatives` or static chocolate data as a
fallback. Existing product scanning, warnings and product details remain
available when substitutions are disabled.

## Evidence

- `productSubstitutionApi.test.ts`: authentication, ownership, request bounds,
  timeouts, safe errors and explicit empty states.
- `candidateRetrieval.test.ts`: category relevance and no chocolate leakage.
- `substitutionEligibility.test.ts` and
  `recommendationsAllergenSafety.test.ts`: profile constraints and reason codes.
- `substitutionObservability.test.ts`: controlled rollout and privacy-bounded
  metrics.
- `be033ProfileAwareSubstitution.e2e.test.ts`: multi-category end-to-end
  scenarios, conflict exclusion, incomplete data and authenticated ownership.
