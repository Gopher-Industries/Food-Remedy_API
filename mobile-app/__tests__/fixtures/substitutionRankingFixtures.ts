/** Stable fixture for ranking-order regression tests. */
export const rankingRegressionFixture = {
  originalBarcode: "9300000000000",
  candidates: [
    { barcode: "9300000000009", nutriscoreGrade: "A", sugars_100g: 1, incompleteAllergenEvidence: true },
    { barcode: "9300000000003", nutriscoreGrade: "B", sugars_100g: null, incompleteAllergenEvidence: false },
    { barcode: "9300000000002", nutriscoreGrade: "B", sugars_100g: null, incompleteAllergenEvidence: false },
    { barcode: "9300000000002", nutriscoreGrade: "A", sugars_100g: 1, incompleteAllergenEvidence: false },
  ],
  expectedBarcodes: ["9300000000002", "9300000000003", "9300000000009"],
} as const;
