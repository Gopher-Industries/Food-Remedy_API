/**
 * Backend uses looser types to match real API variability
 * 
 * This type is for receiving from the backend
 */

export type NutriScoreGrade = "a" | "b" | "c" | "d" | "e" | "unknown" | string;
export type NutrientLevel = "low" | "moderate" | "high" | "unknown";

export interface ImageURL {
  root: string;
  primary: string;
  variants: Record<string, number>;
}

export interface ProductBackend {
  id: string;
  barcode: string;

  productName: string;
  genericName: string | null | "";   // API might send empty string
  brand: string | null | "";

  ingredientsText: string | null | "";
  ingredientsAnalysis: string[] | null | undefined; // can be missing or null
  additives: string[] | null | undefined;
  allergens: string[] | null | undefined;
  categories: string[] | null | undefined;
  labels: string[] | null | undefined;
  ingredients: string[] | null | undefined;

  traces: string | null | "";
  tracesFromIngredients: string | null | "";

  nutriments: Record<string, number | string>;
  nutrientLevels: Record<"fat" | "salt" | "sugars" | "saturated-fat", NutrientLevel>;
  nutriscoreGrade: NutriScoreGrade;

  productQuantity: number | null;
  productQuantityUnit: string | null;
  servingQuantity: number | null;
  servingQuantityUnit: string | null;
  servingSize: string | null;

  dateAdded: string;     // ISO
  lastUpdated: string;   // ISO
  completeness: number;

  imageURL: ImageURL;
}
