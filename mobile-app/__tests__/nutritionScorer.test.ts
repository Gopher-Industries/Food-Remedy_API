import scorer from '../services/nutrition/nutritionScorer';
import { NutritionThresholds } from '../services/nutrition/nutritionThresholds';

describe('nutritionScorer basic tests', () => {
  test('kJ -> kcal conversion and energy thresholds', () => {
    // 300 kJ ≈ 71.68 kcal -> should be low energyDensity (<150)
    const product: any = {
      'energy_100g': 300,
      'energy_unit': 'kJ',
    };
    const res = scorer.scoreProduct(product);
    expect(res.raw.energyKcalPer100).toBeCloseTo(71.68, 1);
    expect(res.tags).toContain('lowEnergyDensity');
  });

  test('sodium mg -> g and salt -> sodium conversion', () => {
    // sodium provided in mg
    const p1: any = {
      'sodium_100g': 500, // mg -> 0.5 g
    };
    const r1 = scorer.scoreProduct(p1);
    expect(r1.raw.sodium).toBeCloseTo(0.5, 3);

    // salt provided (g) -> converted to sodium (g)
    const p2: any = {
      'salt_100g': 1.0, // g salt -> ~0.393 g sodium
    };
    const r2 = scorer.scoreProduct(p2);
    expect(r2.raw.sodium).toBeCloseTo(0.393, 3);
  });

  test('threshold boundaries for sugar low/moderate/high', () => {
    const low: any = { 'sugars_100g': NutritionThresholds.sugar.low };
    const rlow = scorer.scoreProduct(low);
    // sugar == low threshold should be considered low (<= low)
    expect(rlow.tags).toContain('lowSugar');

    const moderate: any = { 'sugars_100g': NutritionThresholds.sugar.moderate };
    const rmod = scorer.scoreProduct(moderate);
    // sugar == moderate threshold should be considered moderateSugar (<= moderate but > low)
    expect(rmod.tags).toContain('moderateSugar');

    const high: any = { 'sugars_100g': NutritionThresholds.sugar.moderate + 1 };
    const rhigh = scorer.scoreProduct(high);
    expect(rhigh.tags).toContain('highSugar');
  });

  test('missing values handled gracefully', () => {
    const p: any = {};
    const r = scorer.scoreProduct(p);
    // Should return tags array (possibly empty) and compositeScore numeric
    expect(Array.isArray(r.tags)).toBe(true);
    expect(typeof r.compositeScore).toBe('number');
  });
});
