jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

import { doc, getDoc } from "firebase/firestore";
import { POST } from "@/app/api/products/classify+api";
import { getRecommendationSummary } from "@/services/recommendations";
import { incompleteAllergenDataFixtures } from "./fixtures/incompleteAllergenData";

describe("POST /api/products/classify allergen safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue({});
  });

  it.each(incompleteAllergenDataFixtures)(
    "returns caution instead of green for $name",
    async ({ fields }) => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({
          barcode: "12345",
          productName: "Incomplete product",
          nutrientLevels: { sugars: "low" },
          ...fields,
        }),
      });

      const response = await POST(
        new Request("http://localhost/api/products/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: "12345",
            profile: { allergies: ["milk"] },
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(200);

      expect(body).toEqual(
        expect.objectContaining({
          colour: "grey",
          score: expect.any(Number),
          reasons: expect.arrayContaining([
            expect.stringMatching(/allergen information.*incomplete/i),
          ]),
        })
      );

      expect(body.score).toBeLessThanOrEqual(50);
    }
  );

  it("returns green for complete non-matching allergen data", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "complete",
        allergens: ["soy"],
        traces: "sesame",
        nutrientLevels: { sugars: "low" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "complete",
          profile: { allergies: ["milk"] },
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "green",
        score: 100,
      })
    );
  });

  it("returns red when a trace matches despite incomplete allergen data", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "trace-match",
        allergens: null,
        traces: "milk",
        nutrientLevels: { sugars: "low" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "trace-match",
          profile: { allergies: ["milk"] },
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "red",
        score: 0,
        reasons: expect.arrayContaining([
          expect.stringMatching(/contains allergens.*milk/i),
        ]),
      })
    );
  });

  it("does not downgrade a nutritionally red product to caution", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "nutrition-red",
        allergens: null,
        traces: null,
        nutrientLevels: {
          fat: "high",
          sugars: "high",
          salt: "high",
          "saturated-fat": "high",
        },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "nutrition-red",
          profile: {},
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "red",
      })
    );
  });

  it("maps a Seafood profile selection to a Fish declaration", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "9300633714437",
        productName: "Canned tuna",
        allergens: ["Fish"],
        traces: "none declared",
        nutrientLevels: { sugars: "low" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "9300633714437",
          profile: { allergies: ["Seafood"] },
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "red",
        score: 0,
        reasons: expect.arrayContaining([
          expect.stringMatching(/contains allergens.*seafood/i),
        ]),
      })
    );
  });

  it("uses tracesFromIngredients as trusted conflict evidence", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "mustard-trace",
        allergens: ["soy"],
        traces: "none declared",
        tracesFromIngredients: "May contain mustard seed",
        nutrientLevels: { sugars: "low" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "mustard-trace",
          profile: { allergies: ["Mustard"] },
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "red",
        score: 0,
      })
    );
  });

  it("flags punctuated precautionary seafood text for a Fish profile", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "fish-precaution",
        allergens: ["soy"],
        traces: "May-contain: SEA/FOOD",
        nutrientLevels: { sugars: "low" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "fish-precaution",
          profile: { allergies: [" fIsH "] },
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "red",
        score: 0,
        reasons: expect.arrayContaining([
          expect.stringMatching(/contains allergens.*fish/i),
        ]),
      })
    );
  });

  it("checks profile intolerances through the same canonical matcher", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "wheat-product",
        allergens: ["wheat"],
        traces: "none declared",
        nutrientLevels: { sugars: "low" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "wheat-product",
          profile: { intolerances: ["Gluten"] },
        }),
      })
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        colour: "red",
        score: 0,
      })
    );
  });

  it("matches the local safety service for a trace allergen conflict", async () => {
    const product = {
      barcode: "trace-parity",
      productName: "Trace parity product",
      allergens: ["soy"],
      traces: "milk",
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
    };

    const profile = {
      allergies: ["milk"],
      intolerances: [],
      additives: [],
      dietaryForm: [],
    };

    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => product,
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: product.barcode,
          profile,
        }),
      })
    );

    const routeResult = await response.json();
    const localResult = getRecommendationSummary(
      product as any,
      profile as any
    );

    expect(routeResult.colour).toBe("red");
    expect(routeResult.score).toBe(0);

    expect(localResult.safetyRating).toBe("red");
    expect(localResult.safe).toBe(false);
  });

  it("matches the local safety service for complete non-matching allergen data", async () => {
    const product = {
      barcode: "safe-parity",
      productName: "Safe parity product",
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
    };

    const profile = {
      allergies: ["milk"],
      intolerances: [],
      additives: [],
      dietaryForm: [],
    };

    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => product,
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: product.barcode,
          profile,
        }),
      })
    );

    const routeResult = await response.json();
    const localResult = getRecommendationSummary(
      product as any,
      profile as any
    );

    expect(routeResult.colour).toBe("green");
    expect(localResult.safetyRating).toBe("green");
    expect(localResult.safe).toBe(true);
  });

  it("returns 400 INVALID_REQUEST for malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{ invalid json",
      })
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "INVALID_REQUEST",
        message: expect.stringMatching(/valid json/i),
      })
    );

    expect(getDoc).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { barcode: "" },
    { barcode: "   " },
    { barcode: 12345 },
    { barcode: null },
  ])(
    "returns 400 for an invalid barcode request %#",
    async (requestBody) => {
      const response = await POST(
        new Request("http://localhost/api/products/classify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        })
      );

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual(
        expect.objectContaining({
          error: "INVALID_REQUEST",
        })
      );

      expect(getDoc).not.toHaveBeenCalled();
    }
  );

  it("returns 404 when the product does not exist", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => false,
    });

    const response = await POST(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({
          barcode: "missing-product",
          profile: {},
        }),
      })
    );

    expect(response.status).toBe(404);

    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "PRODUCT_NOT_FOUND",
      })
    );
  });

  it("keeps the current route response shape", async () => {
  (getDoc as jest.Mock).mockResolvedValue({
    exists: () => true,
    data: () => ({
      barcode: "response-shape",
      productName: "Test Product",
      brand: "Test Brand",
      allergens: ["soy"],
      traces: "sesame",
      nutrientLevels: {
        sugars: "low",
      },
    }),
  });

  const response = await POST(
    new Request("http://localhost/api/products/classify", {
      method: "POST",
      body: JSON.stringify({
        barcode: "response-shape",
        profile: {
          allergies: ["milk"],
        },
      }),
    })
  );

  const body = await response.json();

  expect(response.status).toBe(200);

  expect(body.barcode).toBe("response-shape");
  expect(body.productName).toBe("Test Product");
  expect(body.brand).toBe("Test Brand");
  expect(["red", "green", "grey"]).toContain(body.colour);
  expect(typeof body.score).toBe("number");
  expect(Array.isArray(body.reasons)).toBe(true);
});
});