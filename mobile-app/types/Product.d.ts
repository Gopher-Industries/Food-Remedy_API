/**
 * Product
 * 
 * This is for the frontend after converting the backend product into frontend
 * with a normalise function. This type is more strict
 */

export type NutriScoreGrade = "A" | "B" | "C" | "D" | "E" | "UNKNOWN" | string;
export type NutrientLevel = "low" | "moderate" | "high" | "unknown";

export interface Images {
  root: string;                         // e.g. https://images.openfoodfacts.org/images/products/930/069/500/8826
  primary: string | null;               // matches product_v1 (nullable)
  variants: Record<string, number>;     // e.g. { front_en: 3, nutrition_en: 5 }
}

/** Normalised per-100g-style block from API `nutriments_normalized` */
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

/** Wire shape for tags after backend resolution (product_v1 `tags`) */
export interface ProductTagsWire {
  final?: string[];
  removed?: string[];
}

export interface ProductMetadata {
  enrichmentSource?: "backend" | "ml" | "manual" | "openfoodfacts" | string;
  enrichmentTimestamp?: string | null;
  dataQualityScore?: number | null;
  [key: string]: unknown;
}

export interface Product {
  barcode: string; // Unique ID
  id?: string; // optional explicit id (may be set from backend or fallback)

  // Naming
  productName: string;           // never undefined in UI
  genericName: string | null;
  brand: string | null;          // keep as a single string; split later if needed
  /** Primary category when API sends `category` */
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
  nutriments_normalized?: NutrimentsNormalized;
  nutrientLevels: Record<"fat" | "salt" | "sugars" | "saturated-fat", NutrientLevel>;
  nutriscoreGrade: NutriScoreGrade;

  // Quantities
  productQuantity: number | null;       // e.g. 520
  productQuantityUnit: string | null;   // e.g. "g"
  servingQuantity: number | null;       // e.g. 65
  servingQuantityUnit: string | null;   // e.g. "g"

  // Meta
  metadata?: ProductMetadata;
  enrichmentMetadata?: {
    recommendationScore?: number;
    reasonTags?: string[];
    similarityMetrics?: Record<string, unknown>;
  };
  dateAdded?: string;              // ISO string
  lastUpdated?: string;            // ISO string
  completeness: number;           // 0..1
  imageURL?: Images; // legacy single-image object sometimes used by backend normalisers

  /** Resolved tag names from API (`tags`) */
  tags?: ProductTagsWire;

  // Images
  images: Images;

  /**
   * Local cart / offline snapshot only — not part of typical product-detail API payload.
   * When present, should stay consistent with wire fields (DB011).
   */
  productJson?: Record<string, unknown>;
}
