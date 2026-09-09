/** Representative, synthetic evaluation set. It contains no customer data. */
export const substitutionQualityEvaluationSet = [
  {
    name: "milk-conflict-is-hard-excluded",
    profile: { allergies: ["Milk"], additives: [], dietaryForm: [] },
    candidates: [
      { barcode: "quality-safe-milk", allergens: ["soy"], traces: "sesame" },
      { barcode: "quality-conflict-milk", allergens: ["milk"], traces: "sesame" },
    ],
    prohibitedBarcodes: ["quality-conflict-milk"],
    expectsResults: true,
  },
  {
    name: "seafood-trace-is-hard-excluded",
    profile: { allergies: ["Seafood"], additives: [], dietaryForm: [] },
    candidates: [
      { barcode: "quality-safe-seafood", allergens: ["soy"], traces: "sesame" },
      { barcode: "quality-conflict-seafood", allergens: ["soy"], traces: "may contain prawns" },
    ],
    prohibitedBarcodes: ["quality-conflict-seafood"],
    expectsResults: true,
  },
  {
    name: "diet-and-additive-are-hard-excluded",
    profile: { allergies: [], additives: ["E621"], dietaryForm: ["Vegan"] },
    candidates: [
      { barcode: "quality-safe-diet", allergens: ["soy"], traces: "sesame", labels: ["vegan"], additives: [] },
      { barcode: "quality-conflict-additive", allergens: ["soy"], traces: "sesame", labels: ["vegan"], additives: ["en:e621"] },
      { barcode: "quality-conflict-diet", allergens: ["soy"], traces: "sesame", labels: ["vegetarian"], additives: [] },
    ],
    prohibitedBarcodes: ["quality-conflict-additive", "quality-conflict-diet"],
    expectsResults: true,
  },
  {
    name: "missing-target-category-is-explicit-empty-state",
    profile: { allergies: [], additives: [], dietaryForm: [] },
    candidates: [{ barcode: "quality-unused", allergens: ["soy"], traces: "sesame" }],
    prohibitedBarcodes: [],
    expectsResults: false,
    targetCategoryMissing: true,
  },
] as const;
