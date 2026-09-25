# Report of TEST004 – Profile Integration with Recommendation

## Test Environment
- **Platform**: Web (Expo w mode)
- **Date**: 20th May, 2026

## Test Profiles Created
1. **Profile A**: Soy Allergy + Vegetarian + Weight Loss Goal
2. **Profile B**: Peanuts & Gluten Allergies + Vegan + Heart Health Goal
3. **Profile C (Edge Case)**: No Allergies, No Dietary Preferences, No Health Goals (Control)

## Testing Checklist

### 1. Profile Data Persistence – Allergies, Dietary Preferences & Health Goals

- **Action**: Create 3 profiles with distinct configurations, save, navigate away, and reopen profile screen to verify persistence
- **Expectation**: All saved values (allergies, dietary preferences, health goals) persist correctly after save/reopen/reload
- **Result**: **Pass**
- **Behaviour(s) observed**:
  - Profile A (Soy Allergy + Vegetarian + Weight Loss): All values saved and persisted correctly
  - Profile B (Peanuts & Gluten + Vegan + Heart Health): All values saved and persisted correctly
  - Profile C (Edge Case – all empty): Partial/empty profile did not break the profile screen or navigation flow

**Minimum Pass Criteria Met:**
- Allergies persist after save/reopen/reload ✓
- Dietary preference persists after save/reopen/reload ✓
- Health goals persist after save/reopen/reload ✓
- Partial/empty profile does not break flow ✓
- Updated profile reflects in warnings/recommendation behaviour ✓

---

### 2. Profile Update Immediately Affects Product Warnings & Recommendations

- **Action**: Update profile information (e.g., change dietary preference from Vegetarian to Vegan) and observe whether product warnings and recommendations reflect the change immediately
- **Expectation**: Updated profile information immediately affects product warnings shown in tab "For you" and alternative suggestions in tab "Compare"
- **Result**: **Pass** (partial)
- **Behaviour(s) observed**:
  - Allergy-based warnings update correctly when profile allergy settings are changed
  - Dietary preference change (Vegetarian → Vegan) reflected in "For you" warning tags in search/history view
  - Warning labels update after profile save without requiring app restart

---

### 3. Recommendation Results Change Correctly When Profile Details Change

- **Action**: Switch between profiles with different configurations and observe recommendation output in tab "Compare"
- **Expectation**: Recommendation results in tab "Compare" reflect the active profile's allergies, dietary preferences, and health goals
- **Result**: **Partial Pass**
- **Behaviour(s) observed**:
  - Profile A (Vegetarian + Weight Loss): Recommendations show allergen-free alternatives; some weight-loss-oriented options shown
  - Profile B (Vegan + Heart Health): Allergen conflict (Peanuts, Gluten) correctly flagged; however, some non-vegan alternatives still appear in suggestions
  - Profile C (No restrictions): Recommendations appear generic and pass without conflict flags — as expected
- **Remark**: Dietary preference (Vegan / Vegetarian) is partially respected in recommendations but not consistently enforced across all suggestion slots

---

### 4. Frontend, Backend & Database Alignment

- **Action**: Verify that profile values set in the frontend profile screen are correctly stored in the backend/database and are reflected consistently in the recommendation engine
- **Expectation**: The frontend profile screen, backend profile logic, and database fields are aligned — no mismatch between what is saved and what is used for personalisation
- **Result**: **Pass**
- **Behaviour(s) observed**:
  - Values entered in the profile screen are stored and retrieved correctly on reopen
  - Allergy data saved in profile is read correctly by the recommendation engine for conflict detection
  - No observable mismatch between UI state and recommendation behaviour for allergy fields
- **Remark**: Dietary preferences appear stored correctly but the recommendation engine does not fully consume them — indicating a partial backend-to-engine integration gap

---

### 5. Missing or Incomplete Profile Data Handled Safely

- **Action**: Test Profile C with all fields left empty (no allergies, no dietary preferences, no health goals) and navigate through product scan, "For you", and "Compare" tabs
- **Expectation**: Missing or incomplete profile data is handled safely without breaking the recommendation flow
- **Result**: **Pass**
- **Behaviour(s) observed**:
  - Profile C (empty) loaded without errors
  - "For you" tab shows no conflict flags — correct for a profile with no restrictions
  - "Compare" tab shows generic healthier alternatives — no crash or blank screen
  - No null reference errors or broken UI components observed

---

### 6. Overall Consistency & Integration Summary

- **Overall Profile Integration Effectiveness**: **Moderate–Good**
- **Key Findings**:
  - Profile data (allergies, dietary preferences, health goals) saves and persists correctly across sessions ✓
  - Allergy detection and warning integration works reliably ✓
  - Dietary preference (Vegan / Vegetarian) is stored but not fully enforced in recommendation output ✗
  - Health goals have limited observable impact on recommendation content ✗
  - Empty/incomplete profiles are handled gracefully without errors ✓
  - Frontend–backend–database alignment is confirmed for allergy fields; partial gap exists for dietary preferences in the recommendation engine

- **Suggestions for Improvement**:
  - Strengthen recommendation engine consumption of dietary preferences (Vegan / Vegetarian) to filter out non-compliant alternatives
  - Integrate health goals (e.g., Weight Loss, Heart Health) as active signals in the recommendation scoring logic
  - Add explicit confirmation messaging when profile update has been applied to personalisation (e.g., "Your profile has been updated — recommendations refreshed")
  - Improve "Compare" tab to show profile-aware reasoning for each suggested alternative

---
