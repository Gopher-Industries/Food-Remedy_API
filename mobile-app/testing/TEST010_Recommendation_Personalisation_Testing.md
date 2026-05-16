# Report of TEST010 – Recommendation Personalisation Testing

## Test Environment
- **Platform**: Web (Expo w mode)
- **Date**: 16th May, 2026

## Test Profiles Created
1. **Profile A (Alan) (Primary)**: Peanut Allergy + Vegan
2. **Profile B (Kyle)**: Gluten & Lactose Intolerances + Vegetarian
3. **Profile C (Frye)**: No Allergies, Intolerances or Dietary Preferences (Control)

## Test Demographics
While the settings in Demographics expected to be **Profile-based** are simply **universal within the account**, it is assumed to be valid only when the **Primary Profile** is selected as Active Profile throughout the testing.

## Testing Checklist

### 1. Allergy Warning Test
- **Action**: Searching a product containing peanuts to see whether warning shows to a profile with allergy on peanuts
- **Product Selected**: Peanut M&M's 380gm
- **Expectation**: Clear allergy warning(s) (for personalisation) in tab “For you”
- **Result**: **Pass**
- **Behaviour(s) observed**: Warning appears correctly under Profile A

### 2. Dietary Preference Respect
- **Action**: Switching to Vegan and/or Vegetarian profile to check whether animal-based products are avoided or warned
- **Product Selected**: Beef and Cheese Pie
- **Expectation**: Clear warning/reminder(s) (for personalisation) in tab “For you”
- **Result**: **Fail** (no personalised warnings/reminders for Not Vegan / Not Vegetarian)
- **Remark**: Tags of Not Vegan / Not Vegetarian are available on searching/history functionality but **not** the personalisation features

### 3. Nutrition Guardrail Level-Based Recommendation
- **Action**: Searching an obviously unhealthy product with a Strict Nutrition Guardrail Level and a Relaxed Nutrition Guardrail Level
- **Product Selected**: Salt & Vinegar Crinkle Cut Chips
- **Expectation**:
  1. Warning shown in tab “For you”
  2. Healthier alternatives suggested in tab “Compare”
- **Result**: **Fail**
  1. No personalised warnings (field labelled as “Not available”)
  2. Suggested alternatives remain identical regardless of Strict or Relaxed level

### 4. Alternative Product Quality
- **Action**: Switching to Vegan and/or Vegetarian profile and searching a product to check whether suggested alternatives make sense
- **Product Selected**: Beef and Cheese Pie
- **Expectation**: Alternatives suggested in tab “Compare” are relevant to the searched product and reasonable to the profile
- **Result**: **Poor**
- **Remark**: Very likely **no result-based alternative recommendation** that suggestions appear generic (e.g. bacon and chicken breast suggested to a Vegan profile)

### 5. Overall Consistency & User Experience
- **Overall Personalisation Effectiveness**: **Moderate**
- **Major Issues Found**:
  - Dietary preferences (Vegan / Vegetarian) are basically **NOT** considered in recommendations
  - Nutrition Guardrail Level has **NO observable impact** on suggestions
  - Alternative recommendations are healthier but **not much relevant** to the searched product
  - Allergy detection and warning work fairly well
- Suggestions for Improvement:
  - Strengthen integration between user profile (allergies, intolerances, dietary preferences) / demographics (guardrail) and the recommendation engine
  - Improve clarity of explanations on suggestions in tab “Compare”
  - Make alternative suggestions more context-aware rather than generic healthy options

---