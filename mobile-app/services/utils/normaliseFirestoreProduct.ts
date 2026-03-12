import { Product } from "@/types/Product";

const nullIfEmpty = (v: unknown) =>
  typeof v === "string" ? (v.trim() === "" ? null : v) : v ?? null;

/**
 * Normalise a raw JSON object into a strict Product
 */
export function normaliseFirestoreProduct(raw: any): Product {
  const now = new Date().toISOString();

  return {
    id: raw.id ?? raw.barcode, // fallback id
    barcode: raw.barcode,

    // Naming
    productName: raw.productName ?? "",
    genericName: nullIfEmpty(raw.genericName) as string | null,
    brand: nullIfEmpty(raw.brand) as string | null,

    // Ingredients / tags
    ingredientsText: nullIfEmpty(raw.ingredientsText) as string | null,
    ingredientsAnalysis: raw.ingredientsAnalysis ?? [],
    additives: raw.additives ?? [],
    allergens: raw.allergens ?? [],
    categories: raw.categories ?? [],
    labels: raw.labels ?? [],
    ingredients: raw.ingredients ?? [],

    // Traces
    traces: nullIfEmpty(raw.traces) as string | null,
    tracesFromIngredients: nullIfEmpty(raw.tracesFromIngredients) as string | null,

    // Nutrition
    nutriments: raw.nutriments ?? {},
    nutrientLevels: {
      fat: raw.nutrientLevels?.fat ?? "unknown",
      salt: raw.nutrientLevels?.salt ?? "unknown",
      sugars: raw.nutrientLevels?.sugars ?? "unknown",
      "saturated-fat": raw.nutrientLevels?.["saturated-fat"] ?? "unknown",
    },
    nutriscoreGrade: raw.nutriscoreGrade ?? "unknown",

    // Quantities
    productQuantity: raw.productQuantity ?? null,
    productQuantityUnit: raw.productQuantityUnit ?? null,
    servingQuantity: raw.servingQuantity ?? null,
    servingQuantityUnit: raw.servingQuantityUnit ?? null,

    // Meta
    dateAdded: raw.dateAdded ?? now,
    lastUpdated: raw.lastUpdated ?? now,
    completeness: raw.completeness ?? 0,

    // Images
    images: raw.images ?? {
      root: "",
      primary: "",
      variants: {},
    },
  };
}
