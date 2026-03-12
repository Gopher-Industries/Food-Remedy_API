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
  primary: string;                      // e.g. "front_en"
  variants: Record<string, number>;     // e.g. { front_en: 3, nutrition_en: 5 }
}

export interface Product {
  barcode: string; // Unique ID
  id?: string; // optional explicit id (may be set from backend or fallback)

  // Naming
  productName: string;           // never undefined in UI
  genericName: string | null;
  brand: string | null;          // keep as a single string; split later if needed

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
  nutrientLevels: Record<"fat" | "salt" | "sugars" | "saturated-fat", NutrientLevel>;
  nutriscoreGrade: NutriScoreGrade;

  // Quantities
  productQuantity: number | null;       // e.g. 520
  productQuantityUnit: string | null;   // e.g. "g"
  servingQuantity: number | null;       // e.g. 65
  servingQuantityUnit: string | null;   // e.g. "g"

  // Meta
  dateAdded?: string;              // ISO string
  lastUpdated?: string;            // ISO string
  completeness: number;           // 0..1
  imageURL?: Images; // legacy single-image object sometimes used by backend normalisers

  // Images
  images: Images;
}
