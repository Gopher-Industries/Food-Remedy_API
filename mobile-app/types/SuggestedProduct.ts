// Suggested Product Type

export interface SuggestedProduct {
  id: string;
  name: string;
  brand: string;
  image?: string;
  matchPercentage: number;
  reason: string;
  sodium?: number;
  sugar?: number;
  protein?: number;
  isAllergenFree?: boolean;
  barcode?: string; // Add barcode for shopping list integration
}
