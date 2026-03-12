// JS runtime copy of the TypeScript moodHealthTagger

const NutritionThresholds = {
  sugar: { low: 5, moderate: 15 },
  protein: { high: 12, moderate: 6 },
  fat: { low: 3, moderate: 17.5 },
  saturatedFat: { low: 1.5, moderate: 5 },
  fibre: { high: 6, moderate: 3 },
  energyKcal: { low: 150, moderate: 300 },
  sodium: { low: 0.12, moderate: 0.6 },
};

function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = Number(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function get(product, keys) {
  for (const k of keys) if (k in product) {
    const n = toNumber(product[k]);
    if (n !== null) return n;
  }
  return null;
}

function hasIngredient(product, keywords) {
  const ingredientsStr = String(product.ingredients || product.ingredients_text || '').toLowerCase();
  return keywords.some(k => ingredientsStr.includes(k));
}

function getMoodHealthTags(product, nutritionScores) {
  const tags = [];
  const sugars = get(product, ['sugars_100g','sugars','sugars_value']);
  const protein = get(product, ['proteins_100g','proteins','proteins_value']);
  const fibre = get(product, ['fiber_100g','fiber','fibre_100g','fibre']);
  const fat = get(product, ['fat_100g','fat','fat_value']);
  const satFat = get(product, ['saturated-fat_100g','saturated-fat','saturated-fat_value','saturated_fat_100g']);
  const sodium = (function() {
    if ('sodium_100g' in product) return toNumber(product['sodium_100g']);
    if ('sodium' in product) return toNumber(product['sodium']);
    if ('salt_100g' in product) {
      const s = toNumber(product['salt_100g']); if (s === null) return null; return s * 0.393;
    }
    if ('salt' in product) { const s = toNumber(product['salt']); if (s === null) return null; return s * 0.393; }
    return null;
  })();

  const caffeineKeywords = ['coffee','caffeine','espresso','guarana','yerba mate','matcha','green tea','tea'];
  if (hasIngredient(product, caffeineKeywords)) tags.push({ tag: 'energyBoost', reason: 'contains caffeine source', confidence: 0.95 });

  const proteinVal = protein ?? (nutritionScores && nutritionScores.protein ? nutritionScores.protein / 100 : null);
  if ((proteinVal !== null && proteinVal >= NutritionThresholds.protein.moderate && (sugars === null || sugars <= NutritionThresholds.sugar.low)) || hasIngredient(product, ['matcha','l-theanine'])) {
    tags.push({ tag: 'focus', reason: 'protein + low sugar or matcha present', confidence: 0.75 });
  }

  if (hasIngredient(product, ['chamomile','valerian','lavender','kava'])) tags.push({ tag: 'relax', reason: 'contains calming herbal ingredient', confidence: 0.8 });

  if ((fibre !== null && fibre >= NutritionThresholds.fibre.moderate) || hasIngredient(product, ['probiotic','fermented','kefir','yoghurt','yogurt','sauerkraut','kimchi','inulin'])) {
    const conf = Math.min(1, ((fibre !== null ? Math.min(1, fibre / NutritionThresholds.fibre.high) : 0.6)));
    tags.push({ tag: 'gutHealth', reason: 'high fibre or probiotic/fermented ingredient', confidence: 0.6 + conf*0.4 });
  }

  const energy = get(product, ['energy-kcal_100g','energy_100g','energy']);
  const energyKcal = energy === null ? null : energy;

  let weightLossEligible = false;
  if ((proteinVal !== null && proteinVal >= NutritionThresholds.protein.moderate) && (sugars === null || sugars <= NutritionThresholds.sugar.low)) {
    if (energyKcal === null || energyKcal <= NutritionThresholds.energyKcal.moderate) weightLossEligible = true;
  }
  if (weightLossEligible && !(sugars !== null && sugars > NutritionThresholds.sugar.moderate)) tags.push({ tag: 'weightLoss', reason: 'protein + low sugar and reasonable energy density', confidence: 0.7 });

  if ((satFat !== null && satFat <= NutritionThresholds.saturatedFat.moderate) && (sodium !== null && sodium <= NutritionThresholds.sodium.moderate)) tags.push({ tag: 'heartHealth', reason: 'moderate/low saturated fat and sodium', confidence: 0.6 });
  if (hasIngredient(product, ['omega-3','fish oil','flaxseed','chia'])) tags.push({ tag: 'heartHealth', reason: 'contains omega-3 or alpha-linolenic acid source', confidence: 0.85 });

  if ((sugars !== null && sugars <= NutritionThresholds.sugar.low) && (fibre !== null && fibre >= NutritionThresholds.fibre.moderate)) tags.push({ tag: 'bloodSugarFriendly', reason: 'low sugar and good fibre', confidence: 0.75 });

  if (hasIngredient(product, ['turmeric','curcumin','ginger','berries','green tea'])) tags.push({ tag: 'antiInflammatory', reason: 'contains anti-inflammatory ingredient', confidence: 0.6 });

  // dedupe to highest confidence
  const dedup = {};
  for (const t of tags) {
    if (!dedup[t.tag] || dedup[t.tag].confidence < t.confidence) dedup[t.tag] = t;
  }
  return Object.values(dedup);
}

module.exports = { getMoodHealthTags };
