jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

import { doc, getDoc } from "firebase/firestore";
import { GET } from "../app/api/products/[barcode]+api";

describe("GET /api/products/[barcode]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue({ path: "PRODUCTS/1234567890123" });
  });

  it.each([
    ["missing params", {}],
    ["missing barcode", { params: {} }],
    ["blank barcode", { params: { barcode: "   " } }],
    [
      "non-string barcode",
      { params: { barcode: 1234567890123 as unknown as string } },
    ],
  ] as [string, Parameters<typeof GET>[1]][])(
    "returns 400 for %s",
    async (_caseName, context) => {
      const response = await GET(
        new Request("http://localhost/api/products/invalid"),
        context
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message: "Missing or invalid product barcode.",
      });
      expect(doc).not.toHaveBeenCalled();
      expect(getDoc).not.toHaveBeenCalled();
    }
  );

  it("returns ProductDetailV1 data for an existing product", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        productName: "Test Product",
        categories: ["Snacks"],
        nutriments_normalized: { energy_kcal: 250 },
        images: {
          root: "https://images.openfoodfacts.org/images/products/123",
          primary: "front_en",
          variants: { front_en: 1 },
        },
      }),
    });

    const response = await GET(new Request("http://localhost/api/products/1234567890123"), {
      params: { barcode: "1234567890123" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(doc).toHaveBeenCalledWith({}, "PRODUCTS", "1234567890123");
    expect(body).toEqual(
      expect.objectContaining({
        barcode: "1234567890123",
        productName: "Test Product",
        category: "Snacks",
        tags: { final: [], removed: [] },
      })
    );
    expect(body.nutriments_normalized.energy_kcal).toBe(250);
  });

  it("returns 404 when the product is missing", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => false,
    });

    const response = await GET(new Request("http://localhost/api/products/missing"), {
      params: { barcode: "missing" },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 500 with a stable error when Firestore fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    (getDoc as jest.Mock).mockRejectedValue(new Error("Firestore unavailable"));

    try {
      const response = await GET(
        new Request("http://localhost/api/products/1234567890123"),
        { params: { barcode: "1234567890123" } }
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: "SERVER_ERROR",
        message: "Unexpected error while loading product detail.",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns stable defaults for a sparse product record", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    });

    const response = await GET(
      new Request("http://localhost/api/products/sparse"),
      { params: { barcode: "sparse" } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      barcode: "sparse",
      productName: "",
      brand: null,
      genericName: null,
      additives: [],
      allergens: ["Unknown"],
      ingredients: [],
      ingredientsText: null,
      category: null,
      categories: [],
      labels: [],
      nutrientLevels: {},
      nutriments: {},
      nutriments_normalized: {
        energy_kj: null,
        energy_kcal: null,
        fat_g: null,
        saturated_fat_g: null,
        carbohydrates_g: null,
        sugars_g: null,
        proteins_g: null,
        salt_g: null,
        sodium_mg: null,
        fiber_g: null,
      },
      nutriscoreGrade: null,
      productQuantity: null,
      productQuantityUnit: null,
      servingQuantity: null,
      servingQuantityUnit: null,
      traces: null,
      completeness: null,
      images: { root: "", primary: null, variants: {} },
      tags: { final: [], removed: [] },
      metadata: { source: "firestore" },
    });
  });
});
