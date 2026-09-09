import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  createProductSubstitutionHandler,
  type ProductSubstitutionHandlerDependencies,
} from "@/server/productSubstitutionHandler";
import type { ProductSubstitutionRepository } from "@/server/productSubstitutionService";

const BARCODE = "036000291452";

function product(overrides: Partial<Product> = {}): Product {
  return {
    barcode: BARCODE,
    productName: "Original snack",
    genericName: null,
    brand: "Brand",
    ingredientsText: "oats, soy",
    ingredientsAnalysis: [],
    additives: [],
    allergens: ["soy"],
    categories: ["snacks"],
    labels: ["vegan", "vegetarian", "gluten-free"],
    ingredients: ["oats", "soy"],
    traces: "sesame",
    tracesFromIngredients: null,
    nutriments: { sugars_100g: 12 },
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
    firstName: "",
    lastName: "",
    status: true,
    relationship: "Self",
    age: 30,
    avatarUrl: "",
    additives: [],
    allergies: ["Milk"],
    intolerances: [],
    dietaryForm: [],
    ...overrides,
  };
}

function dependencies(): ProductSubstitutionHandlerDependencies & { repository: jest.Mocked<ProductSubstitutionRepository> } {
  return {
    tokenVerifier: { verifyIdToken: jest.fn().mockResolvedValue({ uid: "verified-user" }) },
    repository: {
      getProduct: jest.fn().mockResolvedValue(product()),
      getAuthoritativeProfile: jest.fn().mockResolvedValue(profile()),
      getCandidates: jest.fn().mockResolvedValue([
        product({ barcode: "036000291469", productName: "Safe snack", nutriments: { sugars_100g: 2 } }),
      ]),
    },
  };
}

function request(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/recommendations/substitutions", {
    method: "POST",
    headers: { Authorization: "Bearer verified-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { version: "1.0.0", barcode: BARCODE, ...overrides };
}

describe("POST /api/recommendations/substitutions", () => {
  it("requires verified authentication before reading profile or products", async () => {
    const deps = dependencies();
    const response = await createProductSubstitutionHandler(deps)(new Request("http://localhost/api/recommendations/substitutions", { method: "POST", body: JSON.stringify(validBody()) }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ version: "1.0.0", error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    expect(deps.repository.getProduct).not.toHaveBeenCalled();
    expect(deps.repository.getAuthoritativeProfile).not.toHaveBeenCalled();
  });

  it("derives the user only from verified auth and rejects caller profile selection or overrides", async () => {
    for (const attemptedField of ["userId", "profileId", "profile", "overrides"]) {
      const deps = dependencies();
      const response = await createProductSubstitutionHandler(deps)(request(validBody({ [attemptedField]: "another-user" })));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("UNSUPPORTED_FIELD");
      expect(deps.repository.getAuthoritativeProfile).not.toHaveBeenCalled();
    }
  });

  it("uses the authoritative profile and returns compact, non-sensitive evidence", async () => {
    const deps = dependencies();
    const response = await createProductSubstitutionHandler(deps)(request(validBody({ limit: 1 })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(deps.repository.getAuthoritativeProfile).toHaveBeenCalledWith("verified-user");
    expect(deps.repository.getCandidates).toHaveBeenCalledWith(expect.objectContaining({ barcode: BARCODE }), 200);
    expect(body).toEqual(expect.objectContaining({
      version: "1.0.0",
      status: "success",
      targetProduct: expect.objectContaining({ barcode: BARCODE, productName: "Original snack" }),
      emptyStateReason: null,
    }));
    expect(body.substitutions).toEqual([expect.objectContaining({
      barcode: "036000291469",
      safetyRating: "green",
      reasonCodes: expect.arrayContaining(["SAFE_ALLERGEN_FREE"]),
    })]);
    expect(JSON.stringify(body)).not.toContain("Milk");
    expect(body.targetProduct).not.toHaveProperty("allergens");
    expect(body.substitutions[0]).not.toHaveProperty("allergens");
  });

  it.each([
    ["invalid barcode", validBody({ barcode: "036000291453" }), "INVALID_BARCODE"],
    ["invalid limit", validBody({ limit: 21 }), "INVALID_LIMIT"],
    ["missing version", { barcode: BARCODE }, "INVALID_REQUEST"],
  ])("rejects %s predictably", async (_name, body, code) => {
    const deps = dependencies();
    const response = await createProductSubstitutionHandler(deps)(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(code);
    expect(deps.repository.getProduct).not.toHaveBeenCalled();
  });

  it("rejects an oversized body and malformed JSON without accessing Firestore", async () => {
    const deps = dependencies();
    const tooLarge = await createProductSubstitutionHandler(deps)(request(validBody({ ignored: "x".repeat(1_100) })));
    expect(tooLarge.status).toBe(413);
    expect((await tooLarge.json()).error.code).toBe("REQUEST_TOO_LARGE");

    const malformed = await createProductSubstitutionHandler(deps)(new Request("http://localhost/api/recommendations/substitutions", {
      method: "POST", headers: { Authorization: "Bearer verified-token" }, body: "{bad-json",
    }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_REQUEST");
    expect(deps.repository.getProduct).not.toHaveBeenCalled();
  });

  it("returns explicit product and profile empty/error states without leaking internals", async () => {
    const missingProduct = dependencies();
    missingProduct.repository.getProduct.mockResolvedValue(null);
    const missingProductResponse = await createProductSubstitutionHandler(missingProduct)(request(validBody()));
    expect(missingProductResponse.status).toBe(404);
    expect((await missingProductResponse.json()).error.code).toBe("PRODUCT_NOT_FOUND");

    const missingProfile = dependencies();
    missingProfile.repository.getAuthoritativeProfile.mockResolvedValue(null);
    const missingProfileResponse = await createProductSubstitutionHandler(missingProfile)(request(validBody()));
    expect(missingProfileResponse.status).toBe(409);
    expect((await missingProfileResponse.json()).error.code).toBe("PROFILE_UNAVAILABLE");
  });

  it("returns a bounded explicit no-result state when no candidate is eligible", async () => {
    const deps = dependencies();
    deps.repository.getCandidates.mockResolvedValue([
      product({ barcode: "036000291469", allergens: ["milk"], traces: "sesame" }),
    ]);
    const response = await createProductSubstitutionHandler(deps)(request(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      status: "no_eligible_candidates",
      substitutions: [],
      emptyStateReason: "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES",
    }));
  });

  it("bounds slow, failed, and cancelled work behind a sanitized unavailable response", async () => {
    const slow = dependencies();
    slow.repository.getProduct.mockImplementation(() => new Promise(() => {}));
    const slowResponse = await createProductSubstitutionHandler({ ...slow, timeoutMs: 5 })(request(validBody()));
    expect(slowResponse.status).toBe(503);
    expect((await slowResponse.json()).error.code).toBe("SUBSTITUTIONS_UNAVAILABLE");

    const failed = dependencies();
    failed.repository.getProduct.mockRejectedValue(new Error("Firestore failed for milk restriction"));
    const failedResponse = await createProductSubstitutionHandler(failed)(request(validBody()));
    expect(failedResponse.status).toBe(503);
    expect(JSON.stringify(await failedResponse.json())).not.toContain("milk restriction");

    const controller = new AbortController();
    controller.abort();
    const cancelledResponse = await createProductSubstitutionHandler(dependencies())(request(validBody(), controller.signal));
    expect(cancelledResponse.status).toBe(503);
    expect((await cancelledResponse.json()).error.code).toBe("SUBSTITUTIONS_UNAVAILABLE");
  });
});
