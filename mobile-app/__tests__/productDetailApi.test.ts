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
    expect(body).toMatchObject({
      error: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
      requestId: expect.any(String),
    });
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("returns the stable sanitized error contract and preserves an approved request ID", async () => {
    (getDoc as jest.Mock).mockRejectedValue(
      new Error("provider body: user@example.com Bearer secret-token")
    );

    const response = await GET(
      new Request("http://localhost/api/products/123", {
        headers: { "x-request-id": "release_trace-123" },
      }),
      { params: { barcode: "123" } }
    );

    await expect(response.json()).resolves.toEqual({
      error: "PRODUCT_DETAIL_FAILED",
      message: "Unable to load product detail.",
      requestId: "release_trace-123",
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("release_trace-123");
  });
});
