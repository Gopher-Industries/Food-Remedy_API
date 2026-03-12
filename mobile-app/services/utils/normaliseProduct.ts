import { ProductBackend } from "@/types/ProductBackend";
import { Product } from "@/types/Product";

const nullIfEmpty = (v: unknown) =>
  typeof v === "string" ? (v.trim() === "" ? null : v) : v ?? null;

/**
 * Normalise Product
 * @param b 
 * @returns 
 */
export function normaliseProduct(b: ProductBackend): Product {
  return {
    id: b.id,
    barcode: b.barcode,

    productName: b.productName ?? "",
    genericName: nullIfEmpty(b.genericName) as string | null,
    brand: nullIfEmpty(b.brand) as string | null,

    ingredientsText: nullIfEmpty(b.ingredientsText) as string | null,
    ingredientsAnalysis: b.ingredientsAnalysis ?? null,                 // undefined -> null
    additives: b.additives ?? [],                                       // null/undefined -> []
    allergens: b.allergens ?? [],
    categories: b.categories ?? [],
    labels: b.labels ?? [],
    ingredients: b.ingredients ?? [],

    traces: nullIfEmpty(b.traces) as string | null,
    tracesFromIngredients: nullIfEmpty(b.tracesFromIngredients) as string | null,

    nutriments: b.nutriments ?? {},
    nutrientLevels:
      b.nutrientLevels ?? {
        fat: "unknown",
        salt: "unknown",
        sugars: "unknown",
        "saturated-fat": "unknown",
      },
    nutriscoreGrade: String(b.nutriscoreGrade ?? "unknown").toUpperCase(),

    productQuantity: b.productQuantity ?? null,
    productQuantityUnit: b.productQuantityUnit ?? null,
    servingQuantity: b.servingQuantity ?? null,
    servingQuantityUnit: b.servingQuantityUnit ?? null,

    dateAdded: b.dateAdded,
    lastUpdated: b.lastUpdated,
    completeness: b.completeness ?? 0,

    images: b.imageURL ?? {
      root: '',
      primary: '',
      variants: {},
    },
  };
}
