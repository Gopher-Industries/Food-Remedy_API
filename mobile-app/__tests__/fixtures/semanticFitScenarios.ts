import type { Product } from '@/types/Product';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import type { PersonalizationContext } from '@/server/personalizationContext';

export function semanticProduct(barcode: string, name: string, category: string,
  overrides: Partial<Product> = {}): Product {
  return { barcode, productName: name, genericName: null, brand: null,
    categories: [category], category, allergens: ['soy'], traces: 'sesame', additives: [], labels: [],
    ingredients: [], ingredientsText: null, ingredientsAnalysis: [], tracesFromIngredients: null,
    nutriments: {}, nutrientLevels: { fat: 'low', salt: 'low', sugars: 'low', 'saturated-fat': 'low' },
    nutriscoreGrade: 'B', productQuantity: null, productQuantityUnit: null,
    servingQuantity: null, servingQuantityUnit: null, completeness: 1,
    images: { root: '', primary: null, variants: {} }, ...overrides };
}

export const semanticProfile = { userId: 'synthetic-owner', profileId: 'synthetic-self',
  firstName: '', lastName: '', status: true, relationship: 'Self', age: 30,
  avatarUrl: '', allergies: ['Milk'], intolerances: [], additives: [], dietaryForm: [] } as NutritionalProfile;

export function semanticContext(text: string): PersonalizationContext {
  return { schemaVersion: '1.0.0', explicit: [], observed: [], inferred: [],
    intention: { text, provenance: 'explicit', source: 'one_off' } };
}

export const semanticFitScenarios = [
  { name: 'crackers', original: semanticProduct('036000291452', 'Plain crackers', 'crackers'),
    candidate: semanticProduct('036000291469', 'Rice cakes', 'rice-cakes'),
    context: semanticContext('Something to eat with dip like crackers') },
  { name: 'lunchbox-treat', original: semanticProduct('036000291476', 'Chocolate biscuits', 'biscuits'),
    candidate: semanticProduct('036000291483', 'Oat squares', 'cereal-bars'),
    context: semanticContext('A tidy lunchbox treat') },
  { name: 'commuting-breakfast', original: semanticProduct('036000291490', 'Breakfast cereal', 'cereals'),
    candidate: semanticProduct('036000291506', 'Breakfast bar', 'breakfast-bars'),
    context: semanticContext('Breakfast while commuting without a bowl') },
  { name: 'recipe-replacement', original: semanticProduct('036000291513', 'Breadcrumbs', 'breadcrumbs'),
    candidate: semanticProduct('036000291520', 'Crushed corn flakes', 'cereals'),
    context: semanticContext('A crunchy coating for a baked recipe') },
] as const;
