// Standalone JS runner to validate nutrition scoring against seed samples.
// This duplicates the scoring logic from the TypeScript scorer but runs in plain Node.js

const path = require('path');
const fs = require('fs');

const samplePath = path.join(__dirname, '..', '..', 'database', 'seeding', 'cleanTestSample.json');
let samples = [];
try {
  samples = require(samplePath);
} catch (e) {
  // fallback to repository path
  const alt = path.join(__dirname, '..', '..', '..', 'database', 'seeding', 'cleanTestSample.json');
  if (fs.existsSync(alt)) samples = require(alt);
  else {
    console.error('Could not load sample JSON at', samplePath);
    process.exit(1);
  }
}

const NutritionThresholds = {
  sugar: { low: 5, moderate: 15 },
  protein: { high: 12, moderate: 6 },
  fat: { low: 3, moderate: 17.5 },
  saturatedFat: { low: 1.5, moderate: 5 },
  fibre: { high: 6, moderate: 3 },
  energyKcal: { low: 150, moderate: 300 },
  sodium: { low: 0.12, moderate: 0.6 },
  compositeWeights: { protein: 0.3, sugar: 0.25, fibre: 0.2, fat: 0.15, sodium: 0.1 },
};

function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = Number(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function getPer100gWithKey(product, keys) {
  for (const k of keys) {
    if (k in product) {
      const n = toNumber(product[k]);
      if (n !== null) return { value: n, key: k };
    }
  }
  return { value: null };
}

function getPer100g(product, keys) {
  const p = getPer100gWithKey(product, keys);
  return p.value;
}

function getEnergyKcalPer100(product) {
  const direct = getPer100g(product, ['energy-kcal_100g', 'energy-kcal_100g_value', 'energy-kcal']);
  if (direct !== null) return direct;
  const energyVal = getPer100g(product, ['energy_100g', 'energy_100g_value', 'energy']);
  if (energyVal === null) return null;
  const unit = product['energy_unit'] || product['energy-kcal_unit'] || '';
  const unitStr = String(unit).toLowerCase();
  if (unitStr.includes('kcal')) return energyVal;
  return energyVal / 4.184;
}

function normalizeSodiumFromProduct(product) {
  const s = getPer100gWithKey(product, ['sodium_100g', 'sodium', 'sodium_value']);
  if (s.value !== null) {
    let sodium = s.value;
    if (sodium > 100) sodium = sodium / 1000; // mg -> g
    return sodium;
  }
  const salt = getPer100gWithKey(product, ['salt_100g', 'salt', 'salt_value']);
  if (salt.value !== null) {
    let saltVal = salt.value;
    if (saltVal > 100) saltVal = saltVal / 1000; // mg -> g
    const sodiumFromSalt = saltVal * 0.393;
    return sodiumFromSalt;
  }
  return null;
}

function invNormalize(value, lowCut, highCut) {
  if (value === null) return 0.5;
  if (value <= lowCut) return 1;
  if (value >= highCut) return 0;
  return 1 - (value - lowCut) / (highCut - lowCut);
}

function scoreProduct(product) {
  const sugars = getPer100g(product, ['sugars_100g', 'sugars', 'sugars_value']);
  const protein = getPer100g(product, ['proteins_100g', 'proteins', 'proteins_value']);
  const fat = getPer100g(product, ['fat_100g', 'fat', 'fat_value']);
  const satFat = getPer100g(product, ['saturated-fat_100g', 'saturated-fat', 'saturated-fat_value', 'saturated_fat_100g']);
  const fibre = getPer100g(product, ['fiber_100g', 'fiber', 'fiber_value', 'fibre_100g', 'fibre']);
  const sodium = normalizeSodiumFromProduct(product);
  const energy = getEnergyKcalPer100(product);

  const scores = {};
  scores.protein = protein === null ? 0 : Math.min(1, protein / Math.max(1, NutritionThresholds.protein.high));
  scores.fibre = fibre === null ? 0 : Math.min(1, fibre / Math.max(1, NutritionThresholds.fibre.high));
  scores.sugar = invNormalize(sugars, NutritionThresholds.sugar.low, NutritionThresholds.sugar.moderate);
  scores.fat = invNormalize(fat, NutritionThresholds.fat.low, NutritionThresholds.fat.moderate);
  scores.saturatedFat = invNormalize(satFat, NutritionThresholds.saturatedFat.low, NutritionThresholds.saturatedFat.moderate);
  scores.sodium = invNormalize(sodium, NutritionThresholds.sodium.low, NutritionThresholds.sodium.moderate);
  scores.energy = invNormalize(energy, NutritionThresholds.energyKcal.low, NutritionThresholds.energyKcal.moderate);

  const weights = NutritionThresholds.compositeWeights;
  const composite = (
    (scores.protein * weights.protein) +
    (scores.fibre * weights.fibre) +
    (scores.sugar * weights.sugar) +
    (scores.fat * weights.fat) +
    (scores.sodium * weights.sodium)
  );
  const compositeScore = Math.round(composite * 100);

  const tags = [];
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

  const hasHighSugar = tags.includes('highSugar');
  const hasHighSodium = tags.includes('highSodium');
  const hasHighFat = tags.includes('highFat') || tags.includes('highSaturatedFat');
  if (compositeScore >= 60 && !hasHighSugar && !hasHighSodium && !hasHighFat) {
    tags.push('balancedNutrition');
  }

  const numericScores = {};
  for (const k of Object.keys(scores)) numericScores[k] = Math.round(scores[k] * 100);

  return {
    tags,
    compositeScore,
    scores: numericScores,
    raw: { sugars, protein, fat, satFat, fibre, sodium, energyKcalPer100: energy },
  };
}

const moodTagger = require('./moodHealthTagger');

function runValidation() {
  console.log('Running nutrition scoring validation for sample products');
  for (const p of samples) {
    const out = scoreProduct(p);
    // call mood/health tagger (JS runtime copy)
    const moodTags = moodTagger.getMoodHealthTags(p, out.scores);
    const resolver = require('./conflictResolver');
    // combine nutrition tags (from scorer) and mood/health tags (from tagger)
    const combined = [];
    for (const t of out.tags) combined.push({ tag: t, source: 'nutrition', confidence: undefined });
    for (const t of moodTags) combined.push({ tag: t.tag, source: 'mood_health', reason: t.reason, confidence: t.confidence });
    const resolved = resolver.resolveConflicts(combined);

    const finalTags = resolved.finalTags.map(t => t.tag);
    const removedTags = resolved.removed.map(t => t.tag);

    console.log('---');
    console.log('Product:', p.product_name || p.name || p.code || 'unnamed');
    console.log('Nutrition Tags:', out.tags.join(', ') || '(none)');
    console.log('Mood/Health Tags:', moodTags.map(t => `${t.tag} (${t.reason}; conf=${Math.round(t.confidence*100)}%)`).join(' | ') || '(none)');
    console.log('CompositeScore:', out.compositeScore);
    console.log('Scores:', out.scores);
    console.log('Raw values:', out.raw);
    console.log('FinalTags:', finalTags.join(', ') || '(none)');
    if (removedTags.length) console.log('Removed conflicting tags:', removedTags.join(', '));
  }
}

if (require.main === module) runValidation();

module.exports = { runValidation };
