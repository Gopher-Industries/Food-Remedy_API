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

  it.each([undefined, null, [], ""])(
    "represents missing or empty allergen data as Unknown (%p)",
    (allergens) => {
      const product = buildProductDetailResponse({ ...raw, allergens });

      expect(product.allergens).toEqual(["Unknown"]);
    },
  );

  it("preserves known allergens and prefers a known detected fallback", () => {
    expect(buildProductDetailResponse(raw).allergens).toEqual(["Milk"]);
    expect(
      buildProductDetailResponse({
        ...raw,
        allergens: [],
        allergensDetected: ["Egg"],
      }).allergens,
    ).toEqual(["Egg"]);
  });

  it("uses the same Unknown representation in the Firestore normalizer", () => {
    const product = normaliseFirestoreProduct({ ...raw, allergens: [] });

    expect(product.allergens).toEqual(["Unknown"]);
  });

  it("keeps malformed nested values inside the ProductDetailV1 contract", () => {
    const product = buildProductDetailResponse({
      barcode: "partial-product",
      productName: "Partial Product",
      categories: "snacks",
      allergens: { tag: "milk" },
      ingredients: { tag: "sugar" },
      nutrientLevels: ["low"],
      nutriments: ["not-an-object"],
      nutriments_normalized: {
        energy_kcal: "250",
        fat_g: "not-a-number",
        custom_value: "7",
      },
      productQuantity: "not-a-number",
      servingQuantity: "30",
      completeness: "not-a-number",
      images: {
        root: null,
        primary: "  ",
        variants: {
          front_en: "3",
          decimal: "1.5",
          invalid: "not-a-number",
        },
      },
      tags: ["not-an-object"],
    });

    expect(product).toEqual(
      expect.objectContaining({
        barcode: "partial-product",
        productName: "Partial Product",
        allergens: ["Unknown"],
        ingredients: ["sugar"],
        categories: ["snacks"],
        category: "snacks",
        nutrientLevels: {},
        nutriments: {},
        productQuantity: null,
        servingQuantity: 30,
        completeness: null,
        images: {
          root: "",
          primary: null,
          variants: { front_en: 3 },
        },
        tags: { final: [], removed: [] },
      })
    );
    expect(product.nutriments_normalized).toEqual({
      energy_kj: null,
      energy_kcal: 250,
      fat_g: null,
      saturated_fat_g: null,
      carbohydrates_g: null,
      sugars_g: null,
      proteins_g: null,
      salt_g: null,
      sodium_mg: null,
      fiber_g: null,
      custom_value: 7,
    });
  });
});
