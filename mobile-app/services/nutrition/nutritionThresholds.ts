// Scientifically grounded thresholds for nutrition scoring.
// Values chosen based on WHO, Australian Dietary Guidelines, and common nutrient profiling approaches.
// Units are per 100g unless noted otherwise.

export const NutritionThresholds = {
  // Sugars (g/100g):
  // <5g = low, 5-15g = moderate, >15g = high
  sugar: {
    low: 5,
    moderate: 15,
  },

  // Protein (g/100g):
  // >12g considered high for solid foods, >6g moderate
  protein: {
    high: 12,
    moderate: 6,
  },

  // Total fat (g/100g):
  // <3g low, 3-17.5g moderate, >17.5g high (aligned with EU nutrition claims ranges)
  fat: {
    low: 3,
    moderate: 17.5,
  },

  // Saturated fat (g/100g):
  // <1.5g low, 1.5-5g moderate, >5g high
  saturatedFat: {
    low: 1.5,
    moderate: 5,
  },

  // Fibre (g/100g):
  // >6g high, 3-6g moderate
  fibre: {
    high: 6,
    moderate: 3,
  },

  // Energy density (kcal/100g):
  // <150 low energy density, 150-300 moderate, >300 high
  energyKcal: {
    low: 150,
    moderate: 300,
  },

  // Sodium (g/100g): note many datasets store sodium in g or mg. Use g/100g here.
  // <0.12g low, 0.12-0.6g moderate, >0.6g high (aligns to 120mg/100g thresholds)
  sodium: {
    low: 0.12,
    moderate: 0.6,
  },

  // Composite thresholds weights (can be tuned)
  compositeWeights: {
    protein: 0.3,
    sugar: 0.25,
    fibre: 0.2,
    fat: 0.15,
    sodium: 0.1,
  },
};

export type Thresholds = typeof NutritionThresholds;
