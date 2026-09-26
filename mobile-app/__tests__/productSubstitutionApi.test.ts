import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  createProductSubstitutionHandler,
  type ProductSubstitutionHandlerDependencies,
} from "@/server/productSubstitutionHandler";
import type { ProductSubstitutionRepository } from "@/server/productSubstitutionService";
import { EnabledSubstitutionRollout } from "@/server/substitutionObservability";
import { DisabledSemanticFitClient, MockSemanticFitClient } from '@/server/semanticFitClient';

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
    rollout: new EnabledSubstitutionRollout(),
    repository: {
      getProduct: jest.fn().mockResolvedValue(product()),
      getAuthoritativeProfile: jest.fn().mockResolvedValue(profile()),
      getOwnedProfile: jest.fn().mockResolvedValue(profile({ profileId: 'child-profile', relationship: 'Child', age: 9 })),
      getCandidates: jest.fn().mockResolvedValue([
        product({ barcode: "036000291469", productName: "Safe snack", nutriments: { sugars_100g: 2 } }),
      ]),
    },
    contextRepository: {
      getOwnedProfile: jest.fn().mockResolvedValue({ active: true, child: true, evidenceConsent: false }),
      getExplicitPreferences: jest.fn().mockResolvedValue(null),
      getSavedIntent: jest.fn().mockResolvedValue(null),
      getRecentEvents: jest.fn().mockResolvedValue([]),
      getProductSemantics: jest.fn().mockResolvedValue(null),
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

function v2Body(overrides: Record<string, unknown> = {}) {
  return { version: '2.0.0', barcode: BARCODE, profileId: 'child-profile', ...overrides };
}

describe("POST /api/recommendations/substitutions", () => {
  it('keeps deterministic substitutions available with semantic evaluation disabled', async () => {
    const deps = dependencies();
    deps.semanticClient = new DisabledSemanticFitClient();
    const response = await createProductSubstitutionHandler(deps)(request(v2Body({ intention: 'Lunchbox snack' })));
    expect(response.status).toBe(200);
    expect((await response.json()).rankingMode).toBe('deterministic');
  });

  it('applies semantic ranking only to safe candidates and stores server-derived model metadata', async () => {
    const deps = dependencies();
    deps.semanticEnabled = true;
    const mock = new MockSemanticFitClient(request => ({
      available: true, model: 'jev-1.13.0', usage: { inputTokens: 40, outputTokens: 4 }, durationMs: 5,
      answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {
        score: 3, confidence: 0.95, probabilities: { '0': 0, '1': 0, '2': 0, '3': 1 },
      }])),
    }));
    deps.semanticClient = mock;
    deps.sessionStore = { create: jest.fn().mockResolvedValue('server_session_semantic') };
    deps.repository.getCandidates.mockResolvedValue([
      product({ barcode: '036000291469', productName: 'Safe snack' }),
      product({ barcode: '036000291476', productName: 'Milk conflict', allergens: ['milk'] }),
    ]);
    const response = await createProductSubstitutionHandler(deps)(request(v2Body({ intention: 'Lunchbox snack' })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rankingMode).toBe('semantic');
    expect(body.rankingReasonCode).toBe('SEMANTIC_CONFIDENT');
    expect(body.substitutions.map((item: { barcode: string }) => item.barcode)).toEqual(['036000291469']);
    expect(body.substitutions[0]).toEqual(expect.objectContaining({
      deterministicScore: expect.any(Number), semanticScore: 1, semanticConfidence: 0.95,
      reasonCodes: expect.arrayContaining(['SEMANTIC_FIT_APPLIED']),
    }));
    expect(mock.calls).toHaveLength(1);
    expect(JSON.stringify(mock.calls)).not.toContain('Milk conflict');
    expect(deps.sessionStore.create).toHaveBeenCalledWith('verified-user', expect.objectContaining({
      rankingMode: 'semantic', modelVersion: 'jev-1.13.0', policyVersion: 'food-composite-v1',
      questionSetVersion: 'food-fit-score-v1',
    }));
  });

  it('returns the exact deterministic order when Jev is unavailable', async () => {
    const deps = dependencies();
    deps.repository.getCandidates.mockResolvedValue([
      product({ barcode: '036000291469', productName: 'Safe A' }),
      product({ barcode: '036000291483', productName: 'Safe B' }),
    ]);
    const handler = createProductSubstitutionHandler(deps);
    const baseline = await (await handler(request(v2Body({ intention: 'Lunchbox snack' })))).json();
    deps.semanticEnabled = true;
    deps.semanticClient = new DisabledSemanticFitClient();
    const fallback = await (await createProductSubstitutionHandler(deps)(request(v2Body({ intention: 'Lunchbox snack' })))).json();
    expect(fallback.rankingMode).toBe('deterministic');
    expect(fallback.rankingReasonCode).toBe('SEMANTIC_FALLBACK');
    expect(fallback.substitutions).toEqual(baseline.substitutions);
  });

  it('returns deterministic v2 results when semantic evaluation exhausts the request deadline', async () => {
    const deps = dependencies();
    deps.semanticEnabled = true;
    deps.semanticClient = { evaluate: async (_request, signal) => new Promise(resolve => {
      signal?.addEventListener('abort', () => resolve({ available: false, reason: 'cancelled' }), { once: true });
    }) };
    const response = await createProductSubstitutionHandler({ ...deps, timeoutMs: 250 })(
      request(v2Body({ intention: 'Lunchbox snack' })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rankingMode).toBe('deterministic');
    expect(body.rankingReasonCode).toBe('SEMANTIC_FALLBACK');
    expect(body.substitutions[0].semanticScore).toBeNull();
  });

  it('selects an owned child profile and emits explicit deterministic v2 score fields', async () => {
    const deps = dependencies();
    deps.sessionStore = { create: jest.fn().mockResolvedValue('server_session_2') };
    const response = await createProductSubstitutionHandler(deps)(request(v2Body({ intention: 'Lunchbox snack' })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(deps.repository.getOwnedProfile).toHaveBeenCalledWith('verified-user', 'child-profile');
    expect(deps.repository.getAuthoritativeProfile).not.toHaveBeenCalled();
    expect(body.version).toBe('2.0.0');
    expect(body.rankingMode).toBe('deterministic');
    expect(body.substitutions[0]).toEqual(expect.objectContaining({
      deterministicScore: expect.any(Number), semanticScore: null, semanticConfidence: null,
      rankingMode: 'deterministic', reasonCodes: expect.arrayContaining(['SAFE_ALLERGEN_FREE']),
    }));
    expect(body.substitutions[0]).not.toHaveProperty('confidenceScore');
    expect(body.recommendationSessionId).toBe('server_session_2');
    expect(JSON.stringify(body)).not.toContain('Lunchbox snack');
    expect(JSON.stringify(body)).not.toContain('Milk');
  });

  it('keeps omitted and empty v2 intentions deterministic with the v1 candidate order', async () => {
    const deps = dependencies();
    const handler = createProductSubstitutionHandler(deps);
    const legacy = await (await handler(request(validBody()))).json();
    const omitted = await (await handler(request(v2Body()))).json();
    const empty = await (await handler(request(v2Body({ intention: '   ' })))).json();
    expect(omitted.substitutions.map((item: { barcode: string }) => item.barcode))
      .toEqual(legacy.substitutions.map((item: { barcode: string }) => item.barcode));
    expect(empty.substitutions).toEqual(omitted.substitutions);
    expect(omitted.substitutions[0].deterministicScore).toBe(legacy.substitutions[0].confidenceScore);
  });

  it('gives missing and foreign v2 profiles the same generic error', async () => {
    const deps = dependencies();
    deps.repository.getOwnedProfile = jest.fn().mockResolvedValue(null);
    const missing = await createProductSubstitutionHandler(deps)(request(v2Body()));
    const foreign = await createProductSubstitutionHandler(deps)(request(v2Body({ profileId: 'foreign-profile' })));
    expect(missing.status).toBe(409);
    expect(await missing.json()).toEqual(await foreign.json());
    expect(deps.contextRepository?.getExplicitPreferences).not.toHaveBeenCalled();
  });

  it.each([
    ['allergies', ['milk']], ['preferences', {}], ['score', 1], ['weights', {}], ['profile', {}],
  ])('rejects v2 caller override %s before reads', async (field, value) => {
    const deps = dependencies();
    const response = await createProductSubstitutionHandler(deps)(request(v2Body({ [field]: value })));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('UNSUPPORTED_FIELD');
    expect(deps.repository.getProduct).not.toHaveBeenCalled();
  });

  it.each([
    { intention: 'a'.repeat(241) }, { intention: 'bad\nline' }, { intention: '\ud800' },
    { intention: 'x', savedIntentId: 'saved' }, { savedIntentId: '../foreign' },
  ])('rejects malformed v2 intention or ownership input', async body => {
    const deps = dependencies();
    const response = await createProductSubstitutionHandler(deps)(request(v2Body(body)));
    expect(response.status).toBe(400);
    expect((await response.json()).version).toBe('2.0.0');
    expect(deps.repository.getProduct).not.toHaveBeenCalled();
  });
  it('issues a server session for feedback without changing deterministic candidates', async () => {
    const deps = dependencies();
    deps.sessionStore = { create: jest.fn().mockResolvedValue('server_session_1') };
    const response = await createProductSubstitutionHandler(deps)(request(validBody()));
    const body = await response.json();
    expect(body.recommendationSessionId).toBe('server_session_1');
    expect(deps.sessionStore.create).toHaveBeenCalledWith('verified-user', {
      profileId: 'self-profile', originalBarcode: BARCODE,
      candidates: [expect.objectContaining({ barcode: '036000291469' })],
    });
    deps.sessionStore = { create: jest.fn().mockRejectedValue(new Error('unavailable')) };
    const fallback = await createProductSubstitutionHandler(deps)(request(validBody()));
    expect(fallback.status).toBe(200);
    expect((await fallback.json()).recommendationSessionId).toBeUndefined();
  });

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

  it("stops reading an oversized stream without Content-Length", async () => {
    const deps = dependencies();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(1_025)));
      },
      cancel() { cancelled = true; },
    });
    const streamedRequest = new Request("http://localhost/api/recommendations/substitutions", {
      method: "POST",
      headers: { Authorization: "Bearer verified-token" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const result = await createProductSubstitutionHandler(deps)(streamedRequest);
    expect(result.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(deps.repository.getProduct).not.toHaveBeenCalled();
  });

  it("times out a stalled request body before accessing Firestore", async () => {
    const deps = dependencies();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    });
    const stalledRequest = new Request("http://localhost/api/recommendations/substitutions", {
      method: "POST",
      headers: { Authorization: "Bearer verified-token" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const result = await createProductSubstitutionHandler({ ...deps, timeoutMs: 20 })(stalledRequest);
    expect(result.status).toBe(503);
    expect(cancelled).toBe(true);
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
