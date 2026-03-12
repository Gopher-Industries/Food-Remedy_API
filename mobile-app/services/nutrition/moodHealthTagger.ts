import { NutritionThresholds } from './nutritionThresholds';

export type MoodHealthTag = {
  tag: string;
  reason: string;
  confidence: number; // 0..1
};

export function getMoodHealthTags(product: any, nutritionScores?: Record<string, number>) : MoodHealthTag[] {
  // Accept either raw nutrient fields or precomputed numeric scores (0..100)
  const tags: MoodHealthTag[] = [];

  const toNumber = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const parsed = Number(String(v).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const get = (keys: string[]) => {
    for (const k of keys) if (k in product) {
      const n = toNumber(product[k]);
      if (n !== null) return n;
    }
    return null;
  };

  const sugars = get(['sugars_100g','sugars','sugars_value']);
  const protein = get(['proteins_100g','proteins','proteins_value']);
  const fibre = get(['fiber_100g','fiber','fibre_100g','fibre']);
  const fat = get(['fat_100g','fat','fat_value']);
  const satFat = get(['saturated-fat_100g','saturated-fat','saturated-fat_value','saturated_fat_100g']);
  const sodium = ((): number | null => {
    if ('sodium_100g' in product) return toNumber(product['sodium_100g']);
    if ('sodium' in product) return toNumber(product['sodium']);
    if ('salt_100g' in product) {
      const s = toNumber(product['salt_100g']);
      if (s === null) return null;
      return s * 0.393;
    }
    if ('salt' in product) {
      const s = toNumber(product['salt']);
      if (s === null) return null;
      return s * 0.393;
    }
    return null;
  })();

  const ingredientsStr = String(product.ingredients || product.ingredients_text || '').toLowerCase();

  // helper to check ingredient keywords
  const hasIngredient = (keywords: string[]) => keywords.some(k => ingredientsStr.includes(k));

  // Mood tag: energyBoost (caffeine-containing ingredients)
  const caffeineKeywords = ['coffee','caffeine','espresso','guarana','yerba mate','matcha','green tea','tea'];
  if (hasIngredient(caffeineKeywords)) {
    tags.push({ tag: 'energyBoost', reason: 'contains caffeine source', confidence: 0.95 });
  }

  // Mood tag: focus (moderate protein and low sugar or matcha)
  const proteinVal = protein ?? (nutritionScores?.protein ? nutritionScores.protein / 100 : null);
  const sugarVal = sugars ?? (nutritionScores?.sugar ? (1 - nutritionScores.sugar/100) * NutritionThresholds.sugar.moderate : null);
  // simple numeric heuristics
  if ((proteinVal !== null && proteinVal >= NutritionThresholds.protein.moderate && (sugars === null || sugars <= NutritionThresholds.sugar.low)) || hasIngredient(['matcha','l-theanine'])) {
    tags.push({ tag: 'focus', reason: 'protein + low sugar or matcha present', confidence: 0.75 });
  }

  // Mood tag: relax (herbal relaxants)
  if (hasIngredient(['chamomile','valerian','lavender','kava'])) {
    tags.push({ tag: 'relax', reason: 'contains calming herbal ingredient', confidence: 0.8 });
  }

  // Health tag: gutHealth (high fibre or probiotic/fermented)
  if ((fibre !== null && fibre >= NutritionThresholds.fibre.moderate) || hasIngredient(['probiotic','fermented','kefir','yoghurt','yogurt','sauerkraut','kimchi','inulin'])) {
    const conf = Math.min(1, ( (fibre !== null ? Math.min(1, fibre / NutritionThresholds.fibre.high) : 0.6) ));
    tags.push({ tag: 'gutHealth', reason: 'high fibre or probiotic/fermented ingredient', confidence: 0.6 + conf*0.4 });
  }

  // Health tag: weightLoss (high protein, low energy density, low sugar) with exclusions
  const energy = get(['energy-kcal_100g','energy_100g','energy']);
  const energyKcal = (() => {
    if (energy === null) return null;
    // naive: assume it's kcal unless unit provided elsewhere; leave for now
    return energy;
  })();

  let weightLossEligible = false;
  if ( (proteinVal !== null && proteinVal >= NutritionThresholds.protein.moderate) && (sugars === null || sugars <= NutritionThresholds.sugar.low) ) {
    if (energyKcal === null || energyKcal <= NutritionThresholds.energyKcal.moderate) weightLossEligible = true;
  }

  if (weightLossEligible && !(sugars !== null && sugars > NutritionThresholds.sugar.moderate)) {
    tags.push({ tag: 'weightLoss', reason: 'protein + low sugar and reasonable energy density', confidence: 0.7 });
  }

  // Exclusion rule example: if high sugar present remove weightLoss
  // (caller can re-evaluate if duplicate)

  // Health tag: heartHealth (low sat fat, low sodium or omega-3 presence)
  if ((satFat !== null && satFat <= NutritionThresholds.saturatedFat.moderate) && (sodium !== null && sodium <= NutritionThresholds.sodium.moderate)) {
    tags.push({ tag: 'heartHealth', reason: 'moderate/low saturated fat and sodium', confidence: 0.6 });
  }
  if (hasIngredient(['omega-3','fish oil','flaxseed','chia'])) {
    tags.push({ tag: 'heartHealth', reason: 'contains omega-3 or alpha-linolenic acid source', confidence: 0.85 });
  }

  // bloodSugarFriendly: low sugar + high fibre
  if ((sugars !== null && sugars <= NutritionThresholds.sugar.low) && (fibre !== null && fibre >= NutritionThresholds.fibre.moderate)) {
    tags.push({ tag: 'bloodSugarFriendly', reason: 'low sugar and good fibre', confidence: 0.75 });
  }

  // antiInflammatory: ingredient based
  if (hasIngredient(['turmeric','curcumin','ginger','berries','green tea'])) {
    tags.push({ tag: 'antiInflammatory', reason: 'contains anti-inflammatory ingredient', confidence: 0.6 });
  }

  // De-duplicate tags by keeping highest confidence
  const dedup: Record<string, MoodHealthTag> = {};
  for (const t of tags) {
    if (!dedup[t.tag] || dedup[t.tag].confidence < t.confidence) dedup[t.tag] = t;
  }

  return Object.values(dedup);
}

export default { getMoodHealthTags };
