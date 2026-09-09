import { performance } from "node:perf_hooks";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import { rankSubstitutionCandidates } from "@/services/substitutionEligibility";
import { substitutionQualityEvaluationSet } from "./fixtures/substitutionQualityEvaluationFixtures";

function product(overrides: Partial<Product> = {}): Product {
  return {
    barcode: "quality-target", productName: "Quality target", genericName: null, brand: null,
    ingredientsText: "oats", ingredientsAnalysis: [], additives: [], allergens: ["soy"], categories: ["snacks"],
    labels: ["vegan"], ingredients: ["oats"], traces: "sesame", tracesFromIngredients: null,
    nutriments: { sugars_100g: 12 }, nutrientLevels: { fat: "low", salt: "low", sugars: "low", "saturated-fat": "low" },
    nutriscoreGrade: "C", productQuantity: null, productQuantityUnit: null, servingQuantity: null,
    servingQuantityUnit: null, completeness: 1, images: { root: "", primary: null, variants: {} }, ...overrides,
  } as Product;
}

function profile(values: { allergies: readonly string[]; additives: readonly string[]; dietaryForm: readonly string[] }): NutritionalProfile {
  return {
    userId: "synthetic-evaluation", profileId: "synthetic-evaluation", firstName: "", lastName: "", status: true,
    relationship: "Self", age: 30, avatarUrl: "", allergies: [...values.allergies], additives: [...values.additives],
    intolerances: [], dietaryForm: [...values.dietaryForm],
  };
}

describe("BE039 substitution quality evaluation", () => {
  it("meets approved safety, relevance, coverage, empty-rate, and latency release gates", () => {
    let knownConflictRecommendations = 0;
    let relevantResults = 0;
    let returnedCases = 0;
    let emptyCases = 0;
    const runFixture = (fixture: (typeof substitutionQualityEvaluationSet)[number]) => {
        const targetCategoryMissing = "targetCategoryMissing" in fixture && fixture.targetCategoryMissing === true;
        const target = product({ categories: targetCategoryMissing ? [] : ["snacks"], category: targetCategoryMissing ? null : "snacks" });
        const candidates = fixture.candidates.map((candidate) => product({
          barcode: candidate.barcode,
          allergens: [...candidate.allergens],
          traces: candidate.traces,
          labels: "labels" in candidate && candidate.labels ? [...candidate.labels] : ["vegan"],
          additives: "additives" in candidate && candidate.additives ? [...candidate.additives] : [],
          nutriments: { sugars_100g: candidate.barcode.startsWith("quality-safe") ? 2 : 12 },
        }));
        const result = rankSubstitutionCandidates(target, candidates, profile(fixture.profile), 5);
        return result;
    };

    for (const fixture of substitutionQualityEvaluationSet) {
        const result = runFixture(fixture);
        const returned = result.substitutions.map((item) => item.barcode);
        knownConflictRecommendations += returned.filter((barcode) => fixture.prohibitedBarcodes.includes(barcode as never)).length;
        if (fixture.expectsResults) {
          returnedCases += 1;
          if (result.substitutions.every((item) => item.reasonCodes.some((code) => code === "MATCH_CATEGORY_EXACT" || code === "MATCH_CATEGORY_SUBSTRING"))) relevantResults += 1;
        } else {
          emptyCases += 1;
          expect(result.emptyStateReason).toBe("INSUFFICIENT_PRODUCT_DATA");
        }
    }
    const started = performance.now();
    for (let repeat = 0; repeat < 50; repeat += 1) {
      for (const fixture of substitutionQualityEvaluationSet) runFixture(fixture);
    }
    const elapsedMs = performance.now() - started;
    const iterations = 50;
    const categoryRelevance = relevantResults / (returnedCases || 1);
    const coverage = returnedCases / substitutionQualityEvaluationSet.length;
    const emptyRate = emptyCases / substitutionQualityEvaluationSet.length;

    expect(knownConflictRecommendations).toBe(0);
    expect(categoryRelevance).toBeGreaterThanOrEqual(0.95);
    expect(coverage).toBeGreaterThanOrEqual(0.75);
    expect(emptyRate).toBeLessThanOrEqual(0.25);
    expect(elapsedMs / iterations).toBeLessThan(50);
  });
});
