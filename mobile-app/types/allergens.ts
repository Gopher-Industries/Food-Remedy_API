// types/allergens.ts
import type { Product } from "./Product";

/**
 * Normalised a word for comparison (case-insensitive, strip non-letters).
 */
export function normaliseAllergen(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z]/g, " ")                        // removed punctuation / numbers
    .trim()
    .split(/\s+/)[0];                               // first word as canonical token
}

/**
 * Here we get all allergens present in a product (normalised and unique).
 * Uses our existing Product.allergens + traces as extra info.
 */
export function getProductAllergens(product: Product | null): string[] {
  if (!product) return [];

  const raw: string[] = [];

  // Core allergen tags coming from backend mapping
  if (Array.isArray(product.allergens)) {
    raw.push(...product.allergens);
  }

  // Optionally, include traces if backend encodes allergens there
  if (product.traces) raw.push(product.traces);
  if (product.tracesFromIngredients) raw.push(product.tracesFromIngredients);

  const normalised = raw
    .filter(Boolean)
    .flatMap((str) =>
      // split by commas/semicolons to handle "milk, soy" in one string
      str.split(/[;,]/g).map((s) => normaliseAllergen(s))
    )
    .filter(Boolean);

  return Array.from(new Set(normalised));
}
