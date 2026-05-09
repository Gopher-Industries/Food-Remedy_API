import { buildProductDetailResponse } from "../services/utils/productDetail";
import { normaliseFirestoreProduct } from "../services/utils/normaliseFirestoreProduct";

describe("Product detail response", () => {
  const raw = {
    barcode: "1234567890123",
    productName: "Test Product",
    brand: "",
    genericName: "Generic Test",
    additives: ["e202"],
    allergens: ["Milk"],
    ingredients: ["sugar", "milk"],
    ingredientsText: "Sugar, Milk",
    categories: ["Snacks", "Sweet snacks"],
    labels: ["organic"],
    nutrientLevels: { fat: "low", salt: "moderate" },
    nutriments: { "energy-kcal_100g": 250 },
    nutriments_normalized: { energy_kcal: 250, proteins_g: 5 },
    nutriscoreGrade: "b",
    productQuantity: "100",
    productQuantityUnit: "g",
    servingQuantity: 30,
    servingQuantityUnit: "g",
    traces: "",
    completeness: 0.8,
    imageURL: {
      root: "https://images.openfoodfacts.org/images/products/123",
      primary: "front_en",
      variants: { front_en: 1 },
    },
    tags: { final: ["vegetarian"], removed: ["highSugar"] },
    metadata: { source: "test" },
    enrichmentMetadata: { recommendationScore: 0.7 },
  };

  it("builds a ProductDetailV1-shaped API response with complete defaults", () => {
    const product = buildProductDetailResponse(raw);

    expect(product).toEqual(
      expect.objectContaining({
        barcode: "1234567890123",
        productName: "Test Product",
        brand: null,
        category: "Snacks",
        categories: ["Snacks", "Sweet snacks"],
        productQuantity: 100,
        traces: null,
        tags: { final: ["vegetarian"], removed: ["highSugar"] },
        metadata: { source: "test" },
      })
    );
    expect(product.images.root).toBe(raw.imageURL.root);
    expect(product.nutriments_normalized.energy_kj).toBeNull();
    expect(product.nutriments_normalized.energy_kcal).toBe(250);
  });

  it("normalises Firestore detail data into the frontend Product shape", () => {
    const product = normaliseFirestoreProduct(raw);

    expect(product.category).toBe("Snacks");
    expect(product.images.root).toBe(raw.imageURL.root);
    expect(product.nutriments_normalized?.proteins_g).toBe(5);
    expect(product.tags?.final).toEqual(["vegetarian"]);
    expect(product.metadata?.source).toBe("test");
  });
});

