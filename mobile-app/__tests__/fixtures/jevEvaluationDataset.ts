import type { Product } from '@/types/Product';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import type { ProductSemanticAttributes } from '@/types/Personalization';
import { semanticProduct, semanticProfile } from './semanticFitScenarios';

export const JEV_EVALUATION_DATASET_VERSION = 'food-jev-eval-v1';
export const JEV_EVALUATION_CATALOGUE_VERSION = 'synthetic-catalogue-v1';
export const JEV_EVALUATION_LABEL_STATUS = 'engineering-provisional';
const generatedAt = '2026-09-01T00:00:00.000Z';

function role(roleValue: 'main' | 'side' | 'treat' | 'ingredient' | 'drink'): ProductSemanticAttributes {
  return { schemaVersion: '1.0.0', evidenceCompleteness: 'partial',
    foodRole: { value: roleValue, source: 'manual', sourceVersion: JEV_EVALUATION_DATASET_VERSION,
      confidence: 0.95, generatedAt } };
}

function caseProducts(index: number, targetName: string, targetCategory: string,
  positiveName: string, positiveCategory: string, distractorName: string,
  roleValue: 'main' | 'side' | 'treat' | 'ingredient' | 'drink',
  conflictAllergen = 'milk') {
  const base = 9300000000000 + index * 10;
  const original = semanticProduct(String(base), targetName, targetCategory,
    { semanticAttributes: role(roleValue) });
  const positive = semanticProduct(String(base + 1), positiveName, positiveCategory,
    { semanticAttributes: role(roleValue), nutriments: { sugars_100g: 2 } });
  const distractor = semanticProduct(String(base + 2), distractorName, targetCategory,
    { semanticAttributes: role('drink'), nutriments: { sugars_100g: 12 } });
  const secondDistractor = semanticProduct(String(base + 3), `Similar ${distractorName}`, targetCategory,
    { semanticAttributes: role('drink'), nutriments: { sugars_100g: 14 } });
  const conflict = semanticProduct(String(base + 4), `Unsafe ${distractorName}`, targetCategory,
    { allergens: [conflictAllergen], traces: conflictAllergen });
  const missingEvidence = semanticProduct(String(base + 5), 'Unclassified product', '',
    { categories: [], category: null });
  return { original, candidates: [positive, distractor, secondDistractor, conflict, missingEvidence], positiveBarcode: positive.barcode,
    prohibitedBarcodes: [conflict.barcode] };
}

export interface JevEvaluationCase {
  id: string;
  intention: string;
  profile: NutritionalProfile;
  original: Product;
  candidates: Product[];
  /** Provisional editorial labels; QA/product approval is a release prerequisite. */
  positiveBarcode: string;
  prohibitedBarcodes: string[];
}

function scenario(id: string, intention: string, index: number, targetName: string, targetCategory: string,
  positiveName: string, positiveCategory: string, distractorName: string,
  roleValue: 'main' | 'side' | 'treat' | 'ingredient' | 'drink',
  profile: NutritionalProfile = semanticProfile,
  conflictAllergen = 'milk'): JevEvaluationCase {
  return { id, intention, profile, ...caseProducts(index, targetName, targetCategory,
    positiveName, positiveCategory, distractorName, roleValue, conflictAllergen) };
}

const childProfile: NutritionalProfile = { ...semanticProfile, profileId: 'synthetic-child', age: 8,
  allergies: ['Peanuts'] };
const adultProfile: NutritionalProfile = { ...semanticProfile, profileId: 'synthetic-adult', age: 41 };

/** Synthetic inputs only. Each case has a cross-category positive, a plausible distractor and a hard conflict. */
export const jevEvaluationDataset: JevEvaluationCase[] = [
  scenario('dip-cracker', 'A crisp base for dip', 1, 'Plain crackers', 'crackers',
    'Rice cakes', 'rice-cakes', 'Sweet crackers', 'side'),
  scenario('lunchbox-treat', 'A tidy lunchbox treat without mess', 2, 'Chocolate biscuits', 'biscuits',
    'Oat squares', 'cereal-bars', 'Melting chocolate biscuits', 'treat', childProfile, 'peanuts'),
  scenario('commuting-breakfast', 'Breakfast while commuting without a bowl', 3, 'Breakfast cereal', 'cereals',
    'Breakfast bar', 'breakfast-bars', 'Loose breakfast cereal', 'main', adultProfile),
  scenario('recipe-coating', 'A crunchy coating for a baked recipe', 4, 'Breadcrumbs', 'breadcrumbs',
    'Crushed corn flakes', 'cereals', 'Seasoned breadcrumbs', 'ingredient'),
  scenario('mild-snack', 'A mild savoury snack for a child', 5, 'Plain chips', 'chips',
    'Plain rice crackers', 'rice-crackers', 'Hot chilli chips', 'side', childProfile, 'peanuts'),
  scenario('texture', 'A crunchy snack instead of something soft', 6, 'Soft oat bar', 'oat-bars',
    'Crisp oat squares', 'cereals', 'Soft chocolate oat bar', 'side'),
  scenario('shared-familiar', 'A familiar snack to share', 7, 'Plain biscuits', 'biscuits',
    'Plain pretzels', 'pretzels', 'Novel spiced biscuits', 'side', adultProfile),
  scenario('portable-snack', 'A portable afternoon snack without preparation', 8, 'Fruit yoghurt', 'yoghurts',
    'Fruit oat bar', 'cereal-bars', 'Large yoghurt tub', 'side'),
];
