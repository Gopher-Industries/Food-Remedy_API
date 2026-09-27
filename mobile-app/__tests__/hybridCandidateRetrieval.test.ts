import { buildSemanticShortlist, meaningfulCategories, intendedOccasion,
  semanticShortlistLimit, HYBRID_READ_BUDGET } from '@/server/hybridCandidateRetrieval';
import type { Product } from '@/types/Product';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import type { PersonalizationContext } from '@/server/personalizationContext';

const timestamp = '2026-09-26T00:00:00Z';
const occasion = { value: 'lunchbox' as const, source: 'manual' as const, sourceVersion: 'fixture-v1', confidence: 1, generatedAt: timestamp };
const context: PersonalizationContext = { schemaVersion: '1.0.0', explicit: [], observed: [], inferred: [],
  intention: { text: 'Lunchbox replacement', provenance: 'explicit', source: 'one_off' } };

function product(barcode: string, categories: string[], overrides: Partial<Product> = {}): Product {
  return { barcode, productName: `Product ${barcode}`, genericName: null, brand: null,
    categories, category: categories[0] ?? null, allergens: ['soy'], traces: 'sesame', additives: [], labels: [],
    ingredients: [], ingredientsText: null, ingredientsAnalysis: [], tracesFromIngredients: null,
    nutriments: {}, nutrientLevels: { fat: 'low', salt: 'low', sugars: 'low', 'saturated-fat': 'low' },
    nutriscoreGrade: 'B', productQuantity: null, productQuantityUnit: null,
    servingQuantity: null, servingQuantityUnit: null, completeness: 1,
    images: { root: '', primary: null, variants: {} }, ...overrides };
}

const profile = { userId: 'owner', profileId: 'child', status: true, relationship: 'Child', age: 9,
  firstName: '', lastName: '', avatarUrl: '', allergies: ['Milk'], intolerances: [], additives: [], dietaryForm: [] } as NutritionalProfile;

describe('bounded hybrid semantic shortlist', () => {
  it('filters broad fallback categories and caps configured budgets', () => {
    expect(meaningfulCategories(product('original', ['other', 'food', 'biscuits']))).toEqual(['biscuits']);
    expect(meaningfulCategories(product('original', ['other', 'food']))).toEqual([]);
    expect(intendedOccasion(context)).toBe('lunchbox');
    expect(semanticShortlistLimit('999')).toBe(12);
    expect(semanticShortlistLimit('50')).toBe(20);
    expect(HYBRID_READ_BUDGET).toBe(180);
  });

  it('recalls a safe cross-category lunchbox candidate before an unsafe one', () => {
    const original = product('original', ['biscuits']);
    const same = product('same', ['biscuits']);
    const cross = product('cross', ['rice-cakes'], { semanticAttributes: {
      schemaVersion: '1.0.0', evidenceCompleteness: 'partial', occasion,
    } });
    const conflict = product('conflict', ['rice-cakes'], { allergens: ['milk'], semanticAttributes: {
      schemaVersion: '1.0.0', evidenceCompleteness: 'partial', occasion,
    } });
    const first = buildSemanticShortlist(original, [same, conflict, cross], profile, context, 2);
    const second = buildSemanticShortlist(original, [cross, same, conflict], profile, context, 2);
    expect(first.products.map(item => item.barcode)).toEqual(['cross', 'same']);
    expect(second.products.map(item => item.barcode)).toEqual(first.products.map(item => item.barcode));
    expect(first.safetyExcluded).toBe(1);
  });
});
