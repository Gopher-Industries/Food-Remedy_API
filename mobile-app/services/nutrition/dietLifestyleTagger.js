// Diet & Lifestyle Tagger (plain JS)
// Detect dietary preference and lifestyle compatibility tags based on
// ingredients, allergen flags, and normalized nutrient fields.

function _normText(s) {
  if (!s) return '';
  return String(s).toLowerCase();
}

function _containsAny(text, keywords) {
  text = _normText(text);
  return keywords.some(k => text.indexOf(k) !== -1);
}

// Primary exported function
function getDietLifestyleTags(product = {}, norm = {}, existingTags = []) {
  const ingredients = _normText(product.ingredients_text || product.ingredients || '');
  const allergens = product.allergens || product.allergens_list || product.allergens_tags || '';
  const allergenText = _normText(allergens);
  const tags = [];
  const reasons = {};

  // Robustness: if both ingredients text is empty and normalized nutrients are absent, avoid making inferences
  if ((!ingredients || ingredients.trim() === '') && (!norm || Object.keys(norm).length === 0)) {
    return { dietTags: [], lifestyleTags: [], reasons: { missing_data: 'no ingredients_text and no normalized nutrients' } };
  }

  // Dietary preference rules
  const animalKeywords = ['milk','egg','egg powder','honey','gelatin','whey','casein','lactose','butter','cheese','yogurt','cream','fish','salmon','tuna','shrimp','prawn','crab','beef','pork','chicken','lamb','mutton','bacon','ham','lard'];
  const meatKeywords = ['meat','beef','pork','chicken','lamb','mutton','bacon','ham','sausag','turkey'];
  const dairyKeywords = ['milk','butter','cheese','cream','yogurt','whey','casein','lactose'];
  const glutenKeywords = ['wheat','barley','rye','spelt','triticale','malt','semolina','farina'];

  // Vegan: no animal-derived ingredients, and no milk/eggs/allergen flags
  const hasAnimal = _containsAny(ingredients, animalKeywords) || _containsAny(allergenText, ['milk','egg','fish','crustacean','gelatin']);
  if (!hasAnimal) {
    tags.push('vegan');
    reasons.vegan = 'no animal keywords or allergen flags detected';
  }

  // Vegetarian: not containing meat/fish
  const hasMeat = _containsAny(ingredients, meatKeywords) || _containsAny(allergenText, ['meat','fish']);
  if (!hasMeat) {
    tags.push('vegetarian');
    reasons.vegetarian = 'no meat/fish keywords or allergen flags detected';
  }

  // Halal: be conservative — require explicit 'halal' label to tag as halal
  const labelledHalal = ingredients.indexOf('halal') !== -1 || allergenText.indexOf('halal') !== -1;
  if (labelledHalal) {
    tags.push('halal');
    reasons.halal = 'explicit halal label';
  }

  // dairyFree
  const hasDairy = _containsAny(ingredients, dairyKeywords) || allergenText.indexOf('milk') !== -1 || allergenText.indexOf('dairy') !== -1;
  if (!hasDairy) {
    tags.push('dairyFree');
    reasons.dairyFree = 'no dairy ingredients or allergen flags detected';
  }

  // glutenFree
  const hasGluten = _containsAny(ingredients, glutenKeywords) || allergenText.indexOf('gluten') !== -1 || allergenText.indexOf('wheat') !== -1;
  if (!hasGluten) {
    tags.push('glutenFree');
    reasons.glutenFree = 'no gluten-containing ingredients or allergen flags detected';
  }

  // Lifestyle tags based on normalized nutrients (assume per 100g fields like carbohydrates_g, sugars_g, fiber_g)
  const carbs = (norm.carbohydrates_g != null) ? Number(norm.carbohydrates_g) : null;
  const sugars = (norm.sugars_g != null) ? Number(norm.sugars_g) : null;
  const fiber = (norm.fiber_g != null) ? Number(norm.fiber_g) : null;

  // ketoFriendly: low carbs threshold: <= 10 g per 100g and sugars <=5
  if ((carbs != null && carbs <= 10) && (sugars == null || sugars <= 5)) {
    tags.push('ketoFriendly');
    reasons.ketoFriendly = `carbs ${carbs}g <=10 and sugars ${sugars}g <=5`;
  }

  // diabeticFriendly: low sugar (<=5g) and moderate carbs (<=20g) and not flagged highSugar
  const hasHighSugarTag = existingTags.includes('highSugar') || existingTags.includes('notSuitableForDiabetics');
  if (!hasHighSugarTag && sugars != null && sugars <= 5 && (carbs == null || carbs <= 20)) {
    tags.push('diabeticFriendly');
    reasons.diabeticFriendly = `sugars ${sugars}g <=5 and carbs ${carbs}g <=20`;
  }

  // lowGI: heuristic: ingredients include wholegrain/legume or fiber>=3 and sugars low
  const lowGIIngredients = ['oat','oats','lentil','chickpea','chick peas','bean','kidney bean','black bean','wholegrain','whole grain','barley','quinoa'];
  if ((_containsAny(ingredients, lowGIIngredients) || (fiber != null && fiber >= 3)) && (sugars == null || sugars <= 5)) {
    tags.push('lowGI');
    reasons.lowGI = 'wholegrain/legume ingredient or fiber>=3 and sugars low';
  }

  // Compatibility checks with existing allergen/health tags: remove tags that conflict
  const finalTags = [];
  for (const t of tags) {
    let keep = true;
    if (t === 'dairyFree' && (allergenText.indexOf('milk') !== -1 || hasDairy)) keep = false;
    if (t === 'glutenFree' && (allergenText.indexOf('gluten') !== -1 || hasGluten)) keep = false;
    if (t === 'vegan' && hasDairy) keep = false; // secondary check
    if (t === 'diabeticFriendly' && existingTags.includes('highSugar')) keep = false;
    if (keep) finalTags.push(t);
    else reasons[`${t}_removed`] = 'conflict with allergen or existing health tags';
  }

  return { dietTags: finalTags.filter(x => ['vegan','vegetarian','halal','dairyFree','glutenFree'].includes(x)), lifestyleTags: finalTags.filter(x => ['ketoFriendly','diabeticFriendly','lowGI'].includes(x)), reasons };
}

module.exports = { getDietLifestyleTags };
