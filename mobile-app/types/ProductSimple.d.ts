/**
 * Simple Product
 * Used in Profile Product Check
 */
export interface ProductSimple {
  allergens: string[];
  traces: string[];
  additives: string[];
  ingredientAnalysis?: string[];
  completeness: number;
};