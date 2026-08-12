import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  getAlternatives,
  getRecommendationSummary,
} from "@/services/recommendations";
import {
  incompleteAllergenDataFixtures,
  type IncompleteAllergenFixture,
} from "./fixtures/incompleteAllergenData";

const profile = {
  allergies: ["milk"],
  additives: [],
  dietaryForm: [],
} as unknown as NutritionalProfile;

const completeProduct = {
  barcode: "complete",
  productName: "Complete product",
  allergens: ["soy"],
  traces: "sesame",
  tracesFromIngredients: null,
  additives: [],
  labels: [],
  categories: ["snacks"],
  nutrientLevels: {
    fat: "low",
    salt: "low",
    sugars: "low",
    "saturated-fat": "low",
  },
  nutriscoreGrade: "A",
  nutriments: {},
} as unknown as Product;

function productWithFields(
  fields: IncompleteAllergenFixture["fields"]
): Product {
  const product = { ...completeProduct } as Record<string, unknown>;

  if ("allergens" in fields) product.allergens = fields.allergens;
  else delete product.allergens;

  if ("traces" in fields) product.traces = fields.traces;
  else delete product.traces;

  return product as unknown as Product;
}

describe("recommendation allergen safety", () => {
  it("keeps an explicit safe result for complete non-matching data", () => {
    expect(getRecommendationSummary(completeProduct, profile)).toEqual(
      expect.objectContaining({ safe: true, safetyRating: "green" })
    );
  });

  it("treats a known trace match as unsafe even when another field is incomplete", () => {
    const product = {
      ...completeProduct,
      allergens: null,
      traces: "milk",
    } as unknown as Product;

    expect(getRecommendationSummary(product, profile)).toEqual(
      expect.objectContaining({
        safe: false,
        reasons: expect.arrayContaining([
          expect.stringMatching(/contains allergen: milk/i),
        ]),
      })
    );
  });

  it("treats canonical Seafood evidence as unsafe and red", () => {
    const seafoodProfile = {
      ...profile,
      allergies: ["Seafood"],
    } as NutritionalProfile;
    const tuna = {
      ...completeProduct,
      barcode: "9300633714437",
      productName: "Canned tuna",
      allergens: ["Fish"],
    } as Product;

    expect(getRecommendationSummary(tuna, seafoodProfile)).toEqual(
      expect.objectContaining({
        safe: false,
        safetyRating: "red",
        reasons: expect.arrayContaining([
          expect.stringMatching(/contains allergen: seafood/i),
        ]),
      })
    );
  });

  it.each(incompleteAllergenDataFixtures)(
    "returns caution instead of safe for $name",
    ({ fields }) => {
      const product = productWithFields(fields);

      expect(getRecommendationSummary(product, profile)).toEqual(
        expect.objectContaining({
          safe: false,
          safetyRating: "grey",
          reasons: expect.arrayContaining([
            expect.stringMatching(/allergen information.*incomplete/i),
          ]),
        })
      );
    }
  );

  it.each(incompleteAllergenDataFixtures)(
    "does not label a recommended alternative safe for $name",
    ({ fields }) => {
      const candidate = {
        ...productWithFields(fields),
        barcode: `candidate-${String(fields.allergens)}-${String(fields.traces)}`,
      } as Product;

      const [recommendation] = getAlternatives(
        completeProduct,
        [candidate],
        profile
      );

      expect(recommendation).toEqual(
        expect.objectContaining({ safetyRating: "grey" })
      );
      expect(recommendation.reasons).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/allergen information.*incomplete/i),
        ])
      );
      expect(recommendation.reasons.join(" ")).not.toMatch(
        /safe for your allergies/i
      );
    }
  );

  it("preserves forbidden-additive penalties in alternative scoring", () => {
    const additiveProfile = {
      ...profile,
      additives: ["e621"],
    } as NutritionalProfile;
    const candidate = {
      ...completeProduct,
      barcode: "forbidden-additive",
      additives: ["e621"],
    };

    const [recommendation] = getAlternatives(
      completeProduct,
      [candidate],
      additiveProfile
    );

    expect(recommendation.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/additive concern/i)])
    );
    expect(recommendation.reasons.join(" ")).not.toMatch(/safe for your allergies/i);
  });
});
