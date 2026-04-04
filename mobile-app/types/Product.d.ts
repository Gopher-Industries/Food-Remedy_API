/**
 * Product
 * 
 * This is for the frontend after converting the backend product into frontend
 * with a normalise function. This type is more strict.
 * 
 * DESIGN NOTES (DB011-aligned, three-layer architecture):
 * 
 * FIELDS ON WIRE (from API / product_v1.json): Core product data plus:
 * - category (primary), categories[], nutriments, nutriments_normalized
 * - tags { final, removed } — resolved tag names (matches API contract)
 * - metadata (enrichmentSource, enrichmentTimestamp, dataQualityScore)
 * - enrichmentMetadata (recommendationScore, reasonTags, similarityMetrics)
 * - dateAdded, lastUpdated when the backend sends them
 *
 * FIELDS NOT ON WIRE: productJson (local cart DB blob); full enrichment{} tree (server-only).
 *
 * METADATA DESIGN: ProductMetadata = source/quality; enrichmentMetadata = recommendation scoring.
 */

export type NutriScoreGrade = "A" | "B" | "C" | "D" | "E" | "UNKNOWN" | string;
export type NutrientLevel = "low" | "moderate" | "high" | "unknown";

export interface Images {
  root: string;                         // e.g. https://images.openfoodfacts.org/images/products/930/069/500/8826
  primary: string | null;               // e.g. "front_en"
  variants: Record<string, number>;     // e.g. { front_en: 3, nutrition_en: 5 }
}

/** Normalised per-100g-style block from API (product_v1 nutriments_normalized). */
export interface NutrimentsNormalized {
  energy_kj?: number | null;
  energy_kcal?: number | null;
  fat_g?: number | null;
  saturated_fat_g?: number | null;
  carbohydrates_g?: number | null;
  sugars_g?: number | null;
  proteins_g?: number | null;
  salt_g?: number | null;
  sodium_mg?: number | null;
  fiber_g?: number | null;
  [key: string]: number | null | undefined;
}

/** Wire shape for health/product tags after backend resolution. */
export interface ProductTagsWire {
  final?: string[];
  removed?: string[];
}

export interface ProductMetadata {
  enrichmentSource?: "backend" | "ml" | "manual" | "openfoodfacts";
  enrichmentTimestamp?: string;
  dataQualityScore?: number;
  [key: string]: any;
}

export interface Product {
  barcode: string; // Unique ID
  id?: string; // optional explicit id (may be set from backend or fallback)

  // Naming
  productName: string;           // never undefined in UI
  genericName: string | null;
  brand: string | null;          // keep as a single string; split later if needed
  /** Primary category (first normalised category); from API when present */
  category?: string | null;

  // Ingredients / tags
  ingredientsText: string | null;
  ingredientsAnalysis: string[] | null;
  additives: string[];
  allergens: string[];
  categories: string[];
  labels: string[];
  ingredients: string[];

  // Traces
  traces: string | null;
  tracesFromIngredients: string | null;

  // Nutrition
  nutriments: Record<string, number | string>; // supports hyphenated keys like "nova-group"
  /** Present when normaliser maps API nutriments_normalized */
  nutriments_normalized?: NutrimentsNormalized;
  nutrientLevels: Record<"fat" | "salt" | "sugars" | "saturated-fat", NutrientLevel>;
  nutriscoreGrade: NutriScoreGrade;

  // Quantities
  productQuantity: number | null;       // e.g. 520
  productQuantityUnit: string | null;   // e.g. "g"
  servingQuantity: number | null;       // e.g. 65
  servingQuantityUnit: string | null;   // e.g. "g"

  // Meta

  completeness: number;           // 0..1
  metadata?: ProductMetadata;
  enrichmentMetadata?: {
    recommendationScore?: number;
    reasonTags?: string[];
    similarityMetrics?: Record<string, any>;
  };
  dateAdded?: string;              // ISO string
  lastUpdated?: string;            // ISO string
  imageURL?: Images; // legacy single-image object sometimes used by backend normalisers

  /** Resolved tag names from API (product_v1 tags) */
  tags?: ProductTagsWire;

  // Images
  images: Images;
}
