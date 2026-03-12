import { Product } from "@/types/Product";
import { ProductSimple } from "@/types/ProductSimple";

const toList = (v: unknown): string[] => {
  if (Array.isArray(v)) {
    return v
      .flatMap(x => (typeof x === "string" ? x.split(/[;,]/) : []));
  }
  if (typeof v === "string") {
    return v.split(/[;,]/);
  }
  return [];
};

const normalise = (v: unknown): string[] => {
  const items = toList(v)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
  // dedupe while preserving order
  return Array.from(new Set(items));
};

/**
 * To Simple Product
 * 
 * Use in profile vs product check
 * @param p 
 * @returns 
 */
export function toSimpleProduct(p: Product | null | undefined): ProductSimple | null {
  if (!p) return null;

  return {
    allergens: normalise(p.allergens),            // string[] | null | string → string[]
    traces: normalise(p.traces),                  // supports string | string[] | null
    additives: normalise(p.additives),
    ingredientAnalysis: normalise((p as any).ingredientAnalysis),
    completeness: p.completeness
  };
}