import { NutritionThresholds } from './nutritionThresholds';

type Scores = Record<string, number>;

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = Number(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function getPer100g(product: any, keys: string[]): number | null {
  for (const k of keys) {
    if (k in product) {
      const n = toNumber(product[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

// Return value and the key that provided it (if any)
function getPer100gWithKey(product: any, keys: string[]): { value: number | null; key?: string } {
  for (const k of keys) {
    if (k in product) {
      const n = toNumber(product[k]);
      if (n !== null) return { value: n, key: k };
    }
  }
  return { value: null };
}

function normalizeSodiumFromProduct(product: any): number | null {
  // Prefer explicit sodium fields
  const s = getPer100gWithKey(product, ['sodium_100g', 'sodium', 'sodium_value']);
  if (s.value !== null) {
    let sodium = s.value;
    // If value looks like mg (large number), convert to g
    if (sodium > 100) sodium = sodium / 1000; // assume mg -> g
    return sodium;
  }

  // Fall back to salt fields (salt_100g etc). Convert salt (NaCl) to sodium (approx factor 0.393)
  const salt = getPer100gWithKey(product, ['salt_100g', 'salt', 'salt_value']);
  if (salt.value !== null) {
    let saltVal = salt.value;
    if (saltVal > 100) saltVal = saltVal / 1000; // assume mg -> g
    const sodiumFromSalt = saltVal * 0.393; // g sodium per g salt
    return sodiumFromSalt;
  }

  return null;
}

function getEnergyKcalPer100(product: any): number | null {
  // Prefer `energy-kcal_100g` then `energy-kcal` or `energy_100g` with unit handling
  const direct = getPer100g(product, ['energy-kcal_100g', 'energy-kcal_100g_value', 'energy-kcal']);
  if (direct !== null) return direct;

  const energyVal = getPer100g(product, ['energy_100g', 'energy_100g_value', 'energy']);
  if (energyVal === null) return null;

  const unit = product['energy_unit'] || product['energy-kcal_unit'] || '';
  const unitStr = String(unit).toLowerCase();
  if (unitStr.includes('kcal')) return energyVal;
  // assume kJ otherwise; convert kJ -> kcal
  return energyVal / 4.184;
}

export function scoreProduct(product: any) {
  const sugars = getPer100g(product, ['sugars_100g', 'sugars', 'sugars_value']);
  const protein = getPer100g(product, ['proteins_100g', 'proteins', 'proteins_value']);
  const fat = getPer100g(product, ['fat_100g', 'fat', 'fat_value']);
  const satFat = getPer100g(product, ['saturated-fat_100g', 'saturated-fat', 'saturated-fat_value', 'saturated_fat_100g']);
  const fibre = getPer100g(product, ['fiber_100g', 'fiber', 'fiber_value', 'fibre_100g', 'fibre']);
  const sodium = normalizeSodiumFromProduct(product);
  const energy = getEnergyKcalPer100(product);

  const scores: Scores = {};

  // For beneficial nutrients higher is better (protein, fibre) -> score 0..1
  scores.protein = protein === null ? 0 : Math.min(1, protein / Math.max(1, NutritionThresholds.protein.high));
  scores.fibre = fibre === null ? 0 : Math.min(1, fibre / Math.max(1, NutritionThresholds.fibre.high));

  // For detrimental nutrients lower is better: 1 means best (low), 0 worst (high)
  function invNormalize(value: number | null, lowCut: number, highCut: number) {
    if (value === null) return 0.5; // unknown -> neutral
    if (value <= lowCut) return 1;
    if (value >= highCut) return 0;
    // linear interpolation between lowCut..highCut -> 1..0
    return 1 - (value - lowCut) / (highCut - lowCut);
  }

  scores.sugar = invNormalize(sugars, NutritionThresholds.sugar.low, NutritionThresholds.sugar.moderate);
  scores.fat = invNormalize(fat, NutritionThresholds.fat.low, NutritionThresholds.fat.moderate);
  scores.saturatedFat = invNormalize(satFat, NutritionThresholds.saturatedFat.low, NutritionThresholds.saturatedFat.moderate);
  scores.sodium = invNormalize(sodium, NutritionThresholds.sodium.low, NutritionThresholds.sodium.moderate);
  scores.energy = invNormalize(energy, NutritionThresholds.energyKcal.low, NutritionThresholds.energyKcal.moderate);

  // Composite balanced nutrition score: weighted sum where beneficial nutrients add positively
  const weights = NutritionThresholds.compositeWeights;
  // normalize protein and fibre to 0..1 (already), invert sugars/fat/sodium (we already did invNormalize)
  const composite = (
    (scores.protein * weights.protein) +
    (scores.fibre * weights.fibre) +
    (scores.sugar * weights.sugar) +
    (scores.fat * weights.fat) +
    (scores.sodium * weights.sodium)
  );

  // Map composite (0..1) to 0..100
  const compositeScore = Math.round(composite * 100);

  // Derive tags using thresholds and scores
  const tags: string[] = [];

  if (protein !== null && protein >= NutritionThresholds.protein.high) tags.push('highProtein');
  else if (protein !== null && protein >= NutritionThresholds.protein.moderate) tags.push('moderateProtein');

  if (sugars !== null) {
    if (sugars <= NutritionThresholds.sugar.low) tags.push('lowSugar');
    else if (sugars <= NutritionThresholds.sugar.moderate) tags.push('moderateSugar');
    else tags.push('highSugar');
  }

  if (fat !== null) {
    if (fat <= NutritionThresholds.fat.low) tags.push('lowFat');
    else if (fat <= NutritionThresholds.fat.moderate) tags.push('moderateFat');
    else tags.push('highFat');
  }

  if (satFat !== null) {
    if (satFat <= NutritionThresholds.saturatedFat.low) tags.push('lowSaturatedFat');
    else if (satFat <= NutritionThresholds.saturatedFat.moderate) tags.push('moderateSaturatedFat');
    else tags.push('highSaturatedFat');
  }

  if (fibre !== null) {
    if (fibre >= NutritionThresholds.fibre.high) tags.push('highFibre');
    else if (fibre >= NutritionThresholds.fibre.moderate) tags.push('moderateFibre');
  }

  if (sodium !== null) {
    if (sodium <= NutritionThresholds.sodium.low) tags.push('lowSodium');
    else if (sodium <= NutritionThresholds.sodium.moderate) tags.push('moderateSodium');
    else tags.push('highSodium');
  }

  if (energy !== null) {
    if (energy <= NutritionThresholds.energyKcal.low) tags.push('lowEnergyDensity');
    else if (energy <= NutritionThresholds.energyKcal.moderate) tags.push('moderateEnergyDensity');
    else tags.push('highEnergyDensity');
  }

  // Composite tag: balancedNutrition
  // Criteria: compositeScore >= 60 and not highSugar and not highSodium and not highFat
  const hasHighSugar = tags.includes('highSugar');
  const hasHighSodium = tags.includes('highSodium');
  const hasHighFat = tags.includes('highFat') || tags.includes('highSaturatedFat');
  if (compositeScore >= 60 && !hasHighSugar && !hasHighSodium && !hasHighFat) {
    tags.push('balancedNutrition');
  }

  // Add interpretive numeric scores in 0..100
  const numericScores: Scores = {};
  for (const k of Object.keys(scores)) numericScores[k] = Math.round((scores as any)[k] * 100);

  return {
    tags,
    compositeScore,
    scores: numericScores,
    raw: {
      sugars,
      protein,
      fat,
      satFat,
      fibre,
      sodium,
      energyKcalPer100: energy,
    },
  };
}

export default { scoreProduct };
