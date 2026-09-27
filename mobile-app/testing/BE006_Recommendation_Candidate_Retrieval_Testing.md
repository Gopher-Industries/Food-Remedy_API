# BE006 Recommendation Candidate Retrieval Testing

## Predecessor and path review

BE005 is complete on `main` as PR #27 (`335e388`, Firebase–SQLite profile
sync). The current repository-supported Firestore recommendation path is:

```text
getRecommendations (EXPO_PUBLIC_API_SOURCE=firestore)
  -> getProductById
  -> getCandidatesForRecommendations
  -> getAlternatives
```

`getRecommendationsWithCandidates` receives a supplied pool and does not query
for candidates. The seven-day meal-plan route has its own product query and
classification workflow, so it is not a recommendation-candidate consumer.

## Coverage and result

`__tests__/recommendationCandidateRetrieval.test.ts` covers:

- missing, empty, broad-only, and malformed source categories without a query;
- normalized specific-category query construction and pool limits;
- no matching candidates;
- original-product exclusion and duplicate barcode removal;
- document-ID barcode fallback and normalization of partial candidate records;
- Firestore query failure propagation to the existing recommendation-service
  error boundary.

The initial test run exposed three defects: malformed category values could
produce a Firestore query, document-ID candidates lacked a returned barcode,
and partial documents were returned without the required `Product` fields.
The narrow production fix filters non-string source categories and normalizes
accepted Firestore candidates through the existing
`normaliseFirestoreProduct` boundary.

Run from `mobile-app`:

```bash
npx jest __tests__/recommendationCandidateRetrieval.test.ts __tests__/recommendationsAllergenSafety.test.ts __tests__/getProductById.test.ts --runInBand
```

Result after the fix: 3 suites passed, 33 tests passed.
