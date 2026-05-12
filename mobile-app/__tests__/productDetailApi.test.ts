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
    expect(body.error).toBe("PRODUCT_NOT_FOUND");
  });
});

