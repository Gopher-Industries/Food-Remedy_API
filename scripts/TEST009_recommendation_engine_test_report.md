
# TEST009 – Recommendation Engine Functional Testing

## Tests Performed
1. Created a new test branch from main.
2. Developed a test script (`scripts/test_recommendation_engine.js`) to run the backend recommendation engine with valid sample inputs.
3. Ran the script using Node.js to simulate recommendations for a sample product and user profile.
4. Verified that the recommendations matched the acceptance criteria for filtering and logical ranking.

### Test Inputs
- **Original Product:** Milk Chocolate (contains milk, high sugar/fat)
- **User Profile:** Vegan, allergic to milk, avoids additive 621
- **Candidate Products:** Dark Chocolate, Fruit Bar, White Chocolate

### Results
- **Recommendations Returned:**
  - #1: Dark Chocolate (Score: 95, Safety: green, Reasons: Healthier, Safe, Vegan)
  - #2: Fruit Bar (Score: 67.5, Safety: green, Reasons: Healthier, Safe)
- **Filtering:** Products with allergens or not matching dietary preferences were filtered out as expected.
- **Scoring:** Results were logically ranked by healthiness and user safety, with the highest scoring and safest products at the top.

### Issues Found
- No issues or errors were encountered during the test run. The engine performed as expected.

### Changes Made
- Added a new test script for functional backend testing.
- Adjusted the script for compatibility with Node.js and the current codebase.

### Acceptance Criteria
- Correct recommendations were returned for valid inputs.
- Results were logically ranked according to filtering and scoring logic.