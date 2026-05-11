// @ts-nocheck
// TEST009: Recommendation Engine Functional Test
// This script runs the recommendation engine with valid inputs and prints the results.

// @ts-ignore
const { getAlternatives } = require("../mobile-app/services/recommendations.js");

// Sample original product (simulate a scanned product)
const originalProduct = {
  barcode: "12345",
  productName: "Milk Chocolate",
  categories: ["chocolates", "sweets"],
  nutrientLevels: { fat: "high", sugars: "high", salt: "low", "saturated-fat": "high" },
  nutriscoreGrade: "D",
  allergens: ["milk"],
  traces: "wheat",
  additives: ["621"],
  labels: ["vegetarian"],
  ingredientsText: null,
  ingredientsAnalysis: null,
  ingredients: [],
  tracesFromIngredients: null,
  nutriments: {},
  genericName: null,
  brand: null,
  completeness: 1,
  productQuantity: null,
  productQuantityUnit: null,
  servingQuantity: null,
  servingQuantityUnit: null,
  images: { root: "", primary: null, variants: {} },
};

// Sample candidate products (alternatives)
const candidates = [
  {
    barcode: "23456",
    productName: "Dark Chocolate",
    categories: ["chocolates", "sweets"],
    nutrientLevels: { fat: "moderate", sugars: "moderate", salt: "low", "saturated-fat": "moderate" },
    nutriscoreGrade: "B",
    allergens: [],
    traces: "",
    additives: [],
    labels: ["vegan", "gluten-free"],
    ingredientsText: null,
    ingredientsAnalysis: null,
    ingredients: [],
    tracesFromIngredients: null,
    nutriments: {},
    genericName: null,
    brand: null,
    completeness: 1,
    productQuantity: null,
    productQuantityUnit: null,
    servingQuantity: null,
    servingQuantityUnit: null,
    images: { root: "", primary: null, variants: {} },
  },
  {
    barcode: "34567",
    productName: "Fruit Bar",
    categories: ["snacks", "fruit bars"],
    nutrientLevels: { fat: "low", sugars: "low", salt: "low", "saturated-fat": "low" },
    nutriscoreGrade: "A",
    allergens: ["nuts"],
    traces: "",
    additives: [],
    labels: ["vegetarian", "gluten-free"],
    ingredientsText: null,
    ingredientsAnalysis: null,
    ingredients: [],
    tracesFromIngredients: null,
    nutriments: {},
    genericName: null,
    brand: null,
    completeness: 1,
    productQuantity: null,
    productQuantityUnit: null,
    servingQuantity: null,
    servingQuantityUnit: null,
    images: { root: "", primary: null, variants: {} },
  },
  {
    barcode: "45678",
    productName: "White Chocolate",
    categories: ["chocolates"],
    nutrientLevels: { fat: "high", sugars: "high", salt: "high", "saturated-fat": "high" },
    nutriscoreGrade: "E",
    allergens: ["milk"],
    traces: "wheat",
    additives: ["621"],
    labels: ["vegetarian"],
    ingredientsText: null,
    ingredientsAnalysis: null,
    ingredients: [],
    tracesFromIngredients: null,
    nutriments: {},
    genericName: null,
    brand: null,
    completeness: 1,
    productQuantity: null,
    productQuantityUnit: null,
    servingQuantity: null,
    servingQuantityUnit: null,
    images: { root: "", primary: null, variants: {} },
  },
];

// Sample user profile
const profile = {
  userId: "user-123",
  profileId: "profile-123",
  firstName: "Test",
  lastName: "User",
  status: true,
  relationship: "Self",
  age: 25,
  avatarUrl: "",
  additives: ["621"],
  allergies: ["milk"],
  intolerances: [],
  dietaryForm: ["vegan"],
};

console.log("Running recommendation engine test...\n");

const recommendations = getAlternatives(originalProduct, candidates, profile, 5);

console.log("Recommendations (sorted):\n");
/**
 * @param {{ product: any, score: number, safetyRating: string, reasons: string[] }} rec
 * @param {number} idx
 */
recommendations.forEach(function (rec, idx) {
  console.log(`#${idx + 1}: ${rec.product.productName}`);
  console.log(`   Score: ${rec.score}`);
  console.log(`   Safety: ${rec.safetyRating}`);
  console.log(`   Reasons: ${rec.reasons.join("; ")}`);
});

if (recommendations.length === 0) {
  console.log("No suitable recommendations found.");
}

console.log("\nTest complete.");
