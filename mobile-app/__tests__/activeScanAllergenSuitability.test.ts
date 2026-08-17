import type { NutritionalProfile } from "@/types/NutritionalProfile";
import { normaliseFirestoreProduct } from "@/services/utils/normaliseFirestoreProduct";
import {
  assessProductForProfile,
  guardOverallFitForAllergenSafety,
  presentAllergenSuitability,
} from "@/services/profileProductSuitability";

const seafoodProfile = {
  allergies: ["Seafood"],
  intolerances: [],
} as unknown as NutritionalProfile;

describe("active scan allergen suitability", () => {
  it("marks the tuna scan fixture unsuitable from trusted ingredient evidence", () => {
    const product = normaliseFirestoreProduct({
      barcode: "9300633714437",
      productName: "Tuna Tomato and Onion",
      allergens: [],
      traces: "",
      tracesFromIngredients: "",
      ingredients: ["tuna", "tomato", "onion"],
      ingredientsText: "Tuna, tomato and onion",
      completeness: 0.475,
    });

    const assessment = assessProductForProfile(product, seafoodProfile);
    expect(assessment).toEqual(
      expect.objectContaining({
        status: "unsafe",
        matchedAllergen: "Seafood",
      })
    );
    expect(presentAllergenSuitability(assessment)).toEqual(
      expect.objectContaining({ status: "bad", label: "Contains allergen" })
    );
    expect(guardOverallFitForAllergenSafety(100, assessment)).toEqual({
      percentage: 0,
      label: "Poor fit",
      status: "bad",
    });
  });

  it("returns caution when the tuna-named fixture has no trusted evidence", () => {
    const product = normaliseFirestoreProduct({
      barcode: "9300633714437",
      productName: "Tuna Tomato and Onion",
      allergens: [],
      traces: "",
      tracesFromIngredients: "",
      ingredients: [],
      ingredientsText: "",
      completeness: 0.475,
    });

    const assessment = assessProductForProfile(product, seafoodProfile);
    expect(assessment.status).toBe("unknown");
    expect(presentAllergenSuitability(assessment)).toEqual(
      expect.objectContaining({
        status: "watch",
        label: "Check allergen information",
      })
    );
    expect(presentAllergenSuitability(assessment).label).not.toBe(
      "No conflict found"
    );
    expect(guardOverallFitForAllergenSafety(100, assessment)).toEqual({
      percentage: 74,
      label: "Moderate fit",
      status: "watch",
    });
  });

  it("uses profile intolerances in the same suitability assessment", () => {
    const product = normaliseFirestoreProduct({
      barcode: "gluten-product",
      allergens: ["gluten"],
      traces: "sesame",
      ingredients: ["wheat flour"],
      completeness: 1,
    });
    const profile = {
      allergies: [],
      intolerances: ["Gluten"],
    } as unknown as NutritionalProfile;

    expect(assessProductForProfile(product, profile)).toEqual(
      expect.objectContaining({
        status: "unsafe",
        matchedAllergen: "Gluten",
      })
    );
  });
});
