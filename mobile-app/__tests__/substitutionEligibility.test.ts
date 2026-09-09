import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  MAX_SUBSTITUTION_RESULTS,
  rankSubstitutionCandidates,
} from "@/services/substitutionEligibility";
import { getAlternatives } from "@/services/recommendations";
import { rankingRegressionFixture } from "./fixtures/substitutionRankingFixtures";

function product(overrides: Partial<Product> = {}): Product {
  return {
    barcode: "9300000000001",
    productName: "Example snack",
    genericName: null,
    brand: null,
    ingredientsText: "oats, soy",
    ingredientsAnalysis: [],
    additives: [],
    allergens: ["soy"],
    categories: ["snacks"],
    labels: ["vegan", "vegetarian", "gluten-free"],
    ingredients: ["oats", "soy"],
    traces: "sesame",
    tracesFromIngredients: null,
    nutriments: {
      "energy-kcal_100g": 300,
      sugars_100g: 12,
      sodium_100g: 200,
      "saturated-fat_100g": 4,
      fiber_100g: 2,
      proteins_100g: 5,
    },
    nutrientLevels: { fat: "low", salt: "low", sugars: "low", "saturated-fat": "low" },
    nutriscoreGrade: "C",
    productQuantity: null,
    productQuantityUnit: null,
    servingQuantity: null,
    servingQuantityUnit: null,
    completeness: 1,
    images: { root: "", primary: null, variants: {} },
    ...overrides,
  } as Product;
}

function profile(overrides: Partial<NutritionalProfile> = {}): NutritionalProfile {
  return {
    userId: "profile-id",
    profileId: "owner-id",
    firstName: "Test",
    lastName: "User",
    status: true,
    relationship: "Self",
    age: 30,
    avatarUrl: "",
    additives: [],
    allergies: [],
    intolerances: [],
    dietaryForm: [],
    ...overrides,
  };
}

describe("substitution eligibility and ranking", () => {
  const original = product({ barcode: rankingRegressionFixture.originalBarcode });

  it("hard-excludes direct and trace allergen conflicts", () => {
    const result = rankSubstitutionCandidates(original, [
      product({ barcode: "9300000000002", allergens: ["milk"], traces: "sesame" }),
      product({ barcode: "9300000000003", allergens: ["soy"], traces: "may contain milk" }),
      product({ barcode: "9300000000004", allergens: ["soy"], traces: "sesame" }),
    ], profile({ allergies: ["Milk"] }));

    expect(result.emptyStateReason).toBeNull();
    expect(result.substitutions.map((item) => item.barcode)).toEqual(["9300000000004"]);
    expect(result.substitutions[0].reasonCodes).toContain("SAFE_ALLERGEN_FREE");
  });

  it("uses canonical matching for multi-allergen profile restrictions", () => {
    const result = rankSubstitutionCandidates(original, [
      product({ barcode: "9300000000002", allergens: ["groundnuts"], traces: "sesame" }),
      product({ barcode: "9300000000003", allergens: ["soy"], traces: "prawns" }),
      product({ barcode: "9300000000004", allergens: ["soy"], traces: "sesame" }),
    ], profile({ allergies: ["Peanuts", "Seafood"] }));

    expect(result.substitutions.map((item) => item.barcode)).toEqual(["9300000000004"]);
  });

  it("excludes incomplete allergen evidence when the profile has a restriction", () => {
    const result = rankSubstitutionCandidates(original, [
      product({ barcode: "9300000000002", allergens: [], traces: "" }),
    ], profile({ allergies: ["Milk"] }));

    expect(result).toEqual({ substitutions: [], emptyStateReason: "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES" });
    expect(getAlternatives(original, [product({ barcode: "9300000000002", allergens: [], traces: "" })], profile({ allergies: ["Milk"] }))).toEqual([]);
  });

  it("retains incomplete evidence only as a grey caution when no allergen restriction is active", () => {
    const result = rankSubstitutionCandidates(original, [
      product({ barcode: "9300000000002", allergens: [], traces: "" }),
    ], profile());

    expect(result.substitutions[0]).toEqual(expect.objectContaining({
      safetyRating: "grey",
      reasonCodes: expect.arrayContaining(["ALLERGEN_EVIDENCE_INCOMPLETE"]),
    }));
  });

  it("makes avoided additives and mandatory dietary requirements non-negotiable", () => {
    const result = rankSubstitutionCandidates(original, [
      product({ barcode: "9300000000002", additives: ["en:e621"] }),
      product({ barcode: "9300000000003", labels: ["vegetarian"] }),
      product({ barcode: "9300000000004", labels: ["vegan", "gluten-free"] }),
    ], profile({ additives: ["E621"], dietaryForm: ["Vegan", "Gluten free"] }));

    expect(result.substitutions.map((item) => item.barcode)).toEqual(["9300000000004"]);
    expect(result.substitutions[0].reasonCodes).toEqual(expect.arrayContaining([
      "DIET_ALIGNED_VEGAN", "DIET_ALIGNED_GLUTEN_FREE",
    ]));
  });

  it("ranks verified safety first, then score and barcode, and removes duplicate barcodes", () => {
    const candidates = rankingRegressionFixture.candidates.map((fixture) => product({
      barcode: fixture.barcode,
      allergens: fixture.incompleteAllergenEvidence ? [] : ["soy"],
      traces: fixture.incompleteAllergenEvidence ? "" : "sesame",
      nutriscoreGrade: fixture.nutriscoreGrade,
      nutriments: fixture.sugars_100g === null ? original.nutriments : { ...original.nutriments, sugars_100g: fixture.sugars_100g },
    }));
    const result = rankSubstitutionCandidates(original, candidates, profile());
    const reversed = rankSubstitutionCandidates(original, [...candidates].reverse(), profile());

    expect(result.substitutions.map((item) => item.barcode)).toEqual(rankingRegressionFixture.expectedBarcodes);
    expect(reversed.substitutions.map((item) => item.barcode)).toEqual(result.substitutions.map((item) => item.barcode));
    expect(result.substitutions[0].reasonCodes).toEqual(expect.arrayContaining(["BETTER_NUTRI_SCORE", "LOWER_SUGAR"]));
  });

  it("uses health-goal evidence, caps output, and preserves deterministic ordering", () => {
    const candidates = Array.from({ length: MAX_SUBSTITUTION_RESULTS + 5 }, (_, index) => product({
      barcode: `9300000000${String(index + 10).padStart(3, "0")}`,
      nutriments: { ...original.nutriments, "energy-kcal_100g": 100, proteins_100g: 12 },
    }));
    const result = rankSubstitutionCandidates(original, candidates, profile({ healthGoal: "weight_loss" }), 999);

    expect(result.substitutions).toHaveLength(MAX_SUBSTITUTION_RESULTS);
    expect(result.substitutions[0].reasonCodes).toContain("HEALTH_GOAL_WEIGHT_LOSS_ALIGNED");
    expect(result.substitutions.map((item) => item.barcode)).toEqual([...result.substitutions.map((item) => item.barcode)].sort());
  });

  it("returns an explicit insufficient-data state when category evidence is missing", () => {
    expect(rankSubstitutionCandidates(product({ categories: [], category: null }), [product({ barcode: "9300000000002" })], profile()))
      .toEqual({ substitutions: [], emptyStateReason: "INSUFFICIENT_PRODUCT_DATA" });
    expect(rankSubstitutionCandidates(original, [product({ barcode: "9300000000002", categories: [], category: null })], profile()))
      .toEqual({ substitutions: [], emptyStateReason: "INSUFFICIENT_PRODUCT_DATA" });
  });

  it("fails closed for a mandatory dietary value without a verified evidence rule", () => {
    expect(rankSubstitutionCandidates(original, [product({ barcode: "9300000000002" })], profile({ dietaryForm: ["No Alcohol"] })))
      .toEqual({ substitutions: [], emptyStateReason: "NO_SAFE_ALTERNATIVES_IN_CATEGORY" });
  });
});
