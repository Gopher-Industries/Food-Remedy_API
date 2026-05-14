import type { Product } from "@/types/Product";

const nullIfEmpty = (v: unknown) =>
  typeof v === "string" ? (v.trim() === "" ? null : v) : v ?? null;

const safeArray = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v])
    .map((x) => String(x).trim())
    .filter(Boolean);

const safeNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const safeImages = (raw: any) =>
  raw.images ?? raw.imageURL ?? {
    root: "",
    primary: null,
    variants: {},
  };

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
    category:
      (nullIfEmpty(raw.category) as string | null) ??
      (Array.isArray(raw.categories) && raw.categories.length ? String(raw.categories[0]) : null),

    // Ingredients / tags
    ingredientsText: nullIfEmpty(raw.ingredientsText) as string | null,
    ingredientsAnalysis: raw.ingredientsAnalysis ?? [],
    additives: safeArray(raw.additives),
    allergens: safeArray(raw.allergens),
    categories: safeArray(raw.categories),
    labels: safeArray(raw.labels),
    ingredients: safeArray(raw.ingredients),

    // Traces
    traces: nullIfEmpty(raw.traces) as string | null,
    tracesFromIngredients: nullIfEmpty(raw.tracesFromIngredients) as string | null,

    // Nutrition
    nutriments: raw.nutriments ?? {},
    nutriments_normalized: raw.nutriments_normalized ?? {},
    nutrientLevels: {
      fat: raw.nutrientLevels?.fat ?? "unknown",
      salt: raw.nutrientLevels?.salt ?? "unknown",
      sugars: raw.nutrientLevels?.sugars ?? "unknown",
      "saturated-fat": raw.nutrientLevels?.["saturated-fat"] ?? "unknown",
    },
    nutriscoreGrade: raw.nutriscoreGrade ?? "unknown",

    // Quantities
    productQuantity: safeNumber(raw.productQuantity),
    productQuantityUnit: raw.productQuantityUnit ?? null,
    servingQuantity: safeNumber(raw.servingQuantity),
    servingQuantityUnit: raw.servingQuantityUnit ?? null,

    // Meta
    dateAdded: raw.dateAdded ?? now,
    lastUpdated: raw.lastUpdated ?? now,
    completeness: raw.completeness ?? 0,
    metadata: raw.metadata ?? {},
    enrichmentMetadata: raw.enrichmentMetadata,
    imageURL: raw.imageURL,
    tags: raw.tags ?? { final: [], removed: [] },

    // Images
    images: safeImages(raw),
  };
}
