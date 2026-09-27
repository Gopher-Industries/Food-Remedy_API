import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  createProductSubstitutionHandler,
  type ProductSubstitutionHandlerDependencies,
} from "@/server/productSubstitutionHandler";
import type { ProductSubstitutionRepository } from "@/server/productSubstitutionService";
import { EnabledSubstitutionRollout } from "@/server/substitutionObservability";

const CEREAL = "036000291452";
const YOGURT = "036000291469";

function product(barcode: string, category: string, overrides: Partial<Product> = {}): Product {
  return {
    barcode,
    productName: `${category} product`,
    genericName: null,
    brand: "Food Remedy test",
    category,
    ingredientsText: "oats",
    ingredientsAnalysis: [],
    additives: [],
    allergens: ["soy"],
    categories: [category],
    labels: ["vegan", "vegetarian", "gluten-free"],
    ingredients: ["oats"],
    traces: "sesame",
    tracesFromIngredients: null,
    nutriments: { sugars_100g: 8, proteins_100g: 4 },
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
    userId: "verified-user",
    profileId: "self-profile",
    firstName: "Test",
    lastName: "Profile",
    status: true,
    relationship: "Self",
    age: 30,
    avatarUrl: "",
    additives: ["e621"],
    allergies: ["milk"],
    intolerances: [],
    dietaryForm: ["vegan"],
    healthGoal: "weight_loss",
    ...overrides,
  };
}

function request(barcode: string, token = "verified-token"): Request {
  return new Request("http://localhost/api/recommendations/substitutions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: "1.0.0", barcode, limit: 5 }),
  });
}

function dependencies(
  products: Map<string, Product>,
  candidates: Map<string, Product[]>,
  activeProfile: NutritionalProfile | null = profile(),
): ProductSubstitutionHandlerDependencies & { repository: jest.Mocked<ProductSubstitutionRepository> } {
  return {
    tokenVerifier: {
      verifyIdToken: jest.fn(async token => {
        if (token !== "verified-token") throw new Error("invalid token");
        return { uid: "verified-user" };
      }),
    },
    rollout: new EnabledSubstitutionRollout(),
    repository: {
      getProduct: jest.fn(async barcode => products.get(barcode) ?? null),
      getAuthoritativeProfile: jest.fn(async uid => uid === "verified-user" ? activeProfile : null),
      getCandidates: jest.fn(async (original, _maximum) => candidates.get(original.barcode) ?? []),
    },
  };
}

describe("BE033 profile-aware substitution end-to-end", () => {
  it("returns category-relevant, explainable results for different product categories", async () => {
    const products = new Map([
      [CEREAL, product(CEREAL, "breakfast-cereals")],
      [YOGURT, product(YOGURT, "yogurts")],
    ]);
    const candidates = new Map([
      [CEREAL, [
        product("036000291476", "breakfast-cereals", {
          productName: "Lower sugar cereal",
          nutriments: { sugars_100g: 2, "energy-kcal_100g": 250 },
          nutriscoreGrade: "A",
        }),
        product("036000291483", "chocolates", { productName: "Unrelated chocolate" }),
      ]],
      [YOGURT, [
        product("036000291490", "yogurts", {
          productName: "Plant yogurt",
          nutriments: { sugars_100g: 3 },
        }),
      ]],
    ]);
    const handler = createProductSubstitutionHandler(dependencies(products, candidates));

    const cereal = await (await handler(request(CEREAL))).json();
    const yogurt = await (await handler(request(YOGURT))).json();

    expect(cereal.status).toBe("success");
    expect(cereal.substitutions.map((item: { barcode: string }) => item.barcode))
      .toEqual(["036000291476"]);
    expect(cereal.substitutions[0].reasonCodes).toEqual(expect.arrayContaining([
      "MATCH_CATEGORY_EXACT",
      "SAFE_ALLERGEN_FREE",
      "DIET_ALIGNED_VEGAN",
      "LOWER_SUGAR",
      "BETTER_NUTRI_SCORE",
    ]));
    expect(cereal.substitutions[0].reasons).toEqual(expect.arrayContaining([
      "Matches the product category.",
      "Has less sugar per 100g.",
    ]));
    expect(yogurt.substitutions.map((item: { barcode: string }) => item.barcode))
      .toEqual(["036000291490"]);
  });

  it("excludes allergen, additive and dietary conflicts without leaking profile values", async () => {
    const products = new Map([[CEREAL, product(CEREAL, "breakfast-cereals")]]);
    const candidates = new Map([[CEREAL, [
      product("036000291476", "breakfast-cereals", { allergens: ["milk"] }),
      product("036000291483", "breakfast-cereals", { additives: ["e621"] }),
      product("036000291490", "breakfast-cereals", { labels: [] }),
    ]] ]);
    const response = await createProductSubstitutionHandler(dependencies(products, candidates))(request(CEREAL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("no_eligible_candidates");
    expect(body.substitutions).toEqual([]);
    expect(JSON.stringify(body).toLowerCase()).not.toContain("milk");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("e621");
  });

  it("re-evaluates the same category for two distinct profiles", async () => {
    const products = new Map([[CEREAL, product(CEREAL, "breakfast-cereals")]]);
    const candidates = new Map([[CEREAL, [
      product("036000291476", "breakfast-cereals", {
        productName: "Dairy cereal",
        allergens: ["milk"],
        labels: ["vegetarian"],
      }),
      product("036000291483", "breakfast-cereals", { productName: "Plant cereal" }),
    ]] ]);

    const restrictedHandler = createProductSubstitutionHandler(dependencies(products, candidates));
    const flexibleHandler = createProductSubstitutionHandler(dependencies(
      products,
      candidates,
      profile({
        profileId: "flexible-profile",
        allergies: [],
        additives: [],
        dietaryForm: [],
        healthGoal: undefined,
      }),
    ));

    const restricted = await (await restrictedHandler(request(CEREAL))).json();
    const flexible = await (await flexibleHandler(request(CEREAL))).json();

    expect(restricted.substitutions.map((item: { barcode: string }) => item.barcode))
      .toEqual(["036000291483"]);
    expect(flexible.substitutions.map((item: { barcode: string }) => item.barcode))
      .toEqual(expect.arrayContaining(["036000291476", "036000291483"]));
  });

  it("fails closed for incomplete evidence and missing category data", async () => {
    const products = new Map([
      [CEREAL, product(CEREAL, "breakfast-cereals")],
      [YOGURT, product(YOGURT, "", { category: null, categories: [] })],
    ]);
    const candidates = new Map([
      [CEREAL, [product("036000291476", "breakfast-cereals", {
        allergens: [], ingredientsText: null, ingredients: [], traces: null,
      })]],
      [YOGURT, [product("036000291490", "yogurts")]],
    ]);
    const handler = createProductSubstitutionHandler(dependencies(products, candidates));

    const incomplete = await (await handler(request(CEREAL))).json();
    const missingCategory = await (await handler(request(YOGURT))).json();

    expect(incomplete).toEqual(expect.objectContaining({
      status: "no_eligible_candidates",
      substitutions: [],
      emptyStateReason: "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES",
    }));
    expect(missingCategory).toEqual(expect.objectContaining({
      status: "insufficient_data",
      substitutions: [],
      emptyStateReason: "INSUFFICIENT_PRODUCT_DATA",
    }));
  });

  it("requires authentication and derives the profile lookup from the verified UID", async () => {
    const products = new Map([[CEREAL, product(CEREAL, "breakfast-cereals")]]);
    const deps = dependencies(products, new Map());
    const handler = createProductSubstitutionHandler(deps);

    const unauthenticated = await handler(new Request(
      "http://localhost/api/recommendations/substitutions",
      { method: "POST", body: JSON.stringify({ version: "1.0.0", barcode: CEREAL }) },
    ));
    const authenticated = await handler(request(CEREAL));

    expect(unauthenticated.status).toBe(401);
    expect(deps.repository.getProduct).toHaveBeenCalledTimes(1);
    expect(deps.repository.getAuthoritativeProfile).toHaveBeenCalledWith("verified-user");
    expect(authenticated.status).toBe(200);
  });
});
