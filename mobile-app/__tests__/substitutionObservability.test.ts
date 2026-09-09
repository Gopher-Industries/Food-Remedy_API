import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import { createProductSubstitutionHandler } from "@/server/productSubstitutionHandler";
import type { ProductSubstitutionRepository } from "@/server/productSubstitutionService";
import {
  ConsoleSubstitutionMetrics,
  EnvironmentSubstitutionRollout,
  type SubstitutionMetricEvent,
} from "@/server/substitutionObservability";

const BARCODE = "036000291452";

function product(overrides: Partial<Product> = {}): Product {
  return {
    barcode: BARCODE, productName: "Snack", genericName: null, brand: "Brand",
    ingredientsText: "oats", ingredientsAnalysis: [], additives: [], allergens: ["soy"],
    categories: ["snacks"], labels: ["vegan"], ingredients: ["oats"], traces: "sesame", tracesFromIngredients: null,
    nutriments: { sugars_100g: 12 }, nutrientLevels: { fat: "low", salt: "low", sugars: "low", "saturated-fat": "low" },
    nutriscoreGrade: "C", productQuantity: null, productQuantityUnit: null, servingQuantity: null,
    servingQuantityUnit: null, completeness: 1, images: { root: "", primary: null, variants: {} }, ...overrides,
  } as Product;
}

const profile: NutritionalProfile = {
  userId: "user-123", profileId: "self", firstName: "", lastName: "", status: true, relationship: "Self", age: 30,
  avatarUrl: "", additives: [], allergies: ["Milk"], intolerances: [], dietaryForm: [],
};

function request(): Request {
  return new Request("http://localhost/api/recommendations/substitutions", {
    method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ version: "1.0.0", barcode: BARCODE }),
  });
}

describe("substitution rollout and observability", () => {
  it("supports enabled, disabled, and deterministic canary rollout without storing identity", () => {
    expect(new EnvironmentSubstitutionRollout({}).isEnabledFor("user-123")).toBe(false);
    expect(new EnvironmentSubstitutionRollout({ SUBSTITUTIONS_ROLLOUT: "enabled" }).isEnabledFor("user-123")).toBe(true);
    expect(new EnvironmentSubstitutionRollout({ SUBSTITUTIONS_ROLLOUT: "disabled" }).isEnabledFor("user-123")).toBe(false);
    expect(new EnvironmentSubstitutionRollout({ SUBSTITUTIONS_ROLLOUT: "canary", SUBSTITUTIONS_CANARY_PERCENT: "0" }).isEnabledFor("user-123")).toBe(false);
    const fullCanary = new EnvironmentSubstitutionRollout({ SUBSTITUTIONS_ROLLOUT: "canary", SUBSTITUTIONS_CANARY_PERCENT: "100" });
    expect(fullCanary.isEnabledFor("user-123")).toBe(true);
    expect(fullCanary.isEnabledFor("user-123")).toBe(true);
  });

  it("records aggregate outcomes, filter counts, and reason-code distribution without PII", async () => {
    const events: SubstitutionMetricEvent[] = [];
    const repository: jest.Mocked<ProductSubstitutionRepository> = {
      getProduct: jest.fn().mockResolvedValue(product()),
      getAuthoritativeProfile: jest.fn().mockResolvedValue(profile),
      getCandidates: jest.fn().mockResolvedValue([
        product({ barcode: "036000291469", productName: "Safe candidate", nutriments: { sugars_100g: 2 } }),
        product({ barcode: "036000291476", allergens: ["milk"] }),
      ]),
    };
    const response = await createProductSubstitutionHandler({
      tokenVerifier: { verifyIdToken: jest.fn().mockResolvedValue({ uid: "user-123" }) },
      repository,
      metrics: { record: (event) => events.push(event) },
    })(request());

    expect(response.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ outcome: "success", resultCount: 1 }));
    expect(events[0].ranking).toEqual(expect.objectContaining({
      candidatesExamined: 2,
      excludedAllergenConflict: 1,
      reasonCodeCounts: expect.objectContaining({ SAFE_ALLERGEN_FREE: 1 }),
    }));
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain("user-123");
    expect(serialized).not.toContain("Milk");
    expect(serialized).not.toContain(BARCODE);
  });

  it("exercises the kill switch without reading a product", async () => {
    const events: SubstitutionMetricEvent[] = [];
    const repository: jest.Mocked<ProductSubstitutionRepository> = {
      getProduct: jest.fn(), getAuthoritativeProfile: jest.fn(), getCandidates: jest.fn(),
    };
    const response = await createProductSubstitutionHandler({
      tokenVerifier: { verifyIdToken: jest.fn().mockResolvedValue({ uid: "user-123" }) },
      repository,
      rollout: { isEnabledFor: () => false },
      metrics: { record: (event) => events.push(event) },
    })(request());

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SUBSTITUTIONS_UNAVAILABLE");
    expect(repository.getProduct).not.toHaveBeenCalled();
    expect(events[0]).toEqual(expect.objectContaining({ outcome: "feature_disabled", resultCount: 0 }));
  });

  it("emits only a safe aggregate payload to the log metric sink", () => {
    const info = jest.spyOn(console, "info").mockImplementation();
    new ConsoleSubstitutionMetrics().record({
      event: "product_substitution", outcome: "empty", durationMs: 42, resultCount: 0,
      emptyStateReason: "NO_SAFE_ALTERNATIVES_IN_CATEGORY",
      ranking: { candidatesExamined: 3, eligibleCandidates: 1, excludedAllergenConflict: 1, excludedAllergenEvidenceIncomplete: 0, excludedAvoidedAdditive: 1, excludedDietaryRestriction: 0, categoryDataFailures: 0, targetCategoryMissing: false, reasonCodeCounts: {} },
    });
    const output = info.mock.calls.flat().join(" ");
    expect(output).toContain("substitution-metric");
    expect(output).not.toContain("user-123");
    expect(output).not.toContain("Milk");
    info.mockRestore();
  });
});
