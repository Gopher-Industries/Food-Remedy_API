import type { Product } from '@/types/Product';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import { assessCandidateSafety } from '@/services/substitutionEligibility';
import type { PersonalizationContext } from './personalizationContext';

export const HYBRID_READ_BUDGET = 180;
export const MAX_SEMANTIC_SHORTLIST = 20;
export const DEFAULT_SEMANTIC_SHORTLIST = 12;

const BROAD = new Set(['food', 'foods', 'products', 'groceries', 'grocery', 'meals', 'meal',
  'dishes', 'dish', 'prepared-meals', 'prepared-foods', 'other', 'uncategorized', 'unknown']);
const STOP_WORDS = new Set(['plain', 'original', 'brand', 'food', 'foods', 'product', 'products']);

export interface HybridCandidatePool {
  candidates: Product[];
  readCount: number;
  latencyMs: number;
  branchCounts: Partial<Record<'category' | 'occasion' | 'role' | 'name' | 'label', number>>;
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/^en:/, '').replace(/\s+/g, '-');
}

export function meaningfulCategories(product: Product): string[] {
  const values = [...(Array.isArray(product.categories) ? product.categories : []), product.category];
  return [...new Set(values.map(normalized).filter(value => value && !BROAD.has(value)))].slice(-2);
}

export function namePrefix(product: Product): string | null {
  const text = `${product.genericName ?? ''} ${product.productName ?? ''}`.normalize('NFKC').toLowerCase();
  return text.match(/[\p{L}\p{N}]{4,}/gu)?.find(word => !STOP_WORDS.has(word))?.slice(0, 24) ?? null;
}

export function intendedOccasion(context: PersonalizationContext): string | null {
  if (context.intention?.occasion) return context.intention.occasion;
  const text = context.intention?.text.toLowerCase() ?? '';
  if (/\blunch\s?box\b/.test(text)) return 'lunchbox';
  if (/\bcommut(e|ing)\b/.test(text)) return 'commute';
  if (/\bbreakfast\b/.test(text)) return 'breakfast';
  if (/\brecipe\b/.test(text)) return 'recipe';
  if (/\b(snack|snacking)\b/.test(text)) return 'snack';
  if (/\bshar(e|ing|ed)\b/.test(text)) return 'shared';
  return null;
}

export function semanticShortlistLimit(value: unknown): number {
  const parsed = typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : DEFAULT_SEMANTIC_SHORTLIST;
  return Math.max(1, Math.min(MAX_SEMANTIC_SHORTLIST, parsed));
}

function preRankScore(original: Product, candidate: Product, context: PersonalizationContext): number {
  let score = 0;
  const originalCats = meaningfulCategories(original);
  const candidateCats = meaningfulCategories(candidate);
  if (originalCats.some(category => candidateCats.includes(category))) score += 3;
  const role = original.semanticAttributes?.foodRole;
  const candidateRole = candidate.semanticAttributes?.foodRole;
  if (role && candidateRole && role.value !== 'not_applicable' && role.value === candidateRole.value &&
      role.confidence >= 0.7 && candidateRole.confidence >= 0.7) score += 4;
  const occasion = intendedOccasion(context);
  const candidateOccasion = candidate.semanticAttributes?.occasion;
  if (occasion && candidateOccasion?.value === occasion && candidateOccasion.confidence >= 0.7) score += 5;
  const prefix = namePrefix(original);
  if (prefix && candidate.productName.toLowerCase().includes(prefix)) score += 1;
  for (const preference of context.explicit) {
    if (preference.dimension !== 'texture') continue;
    const texture = candidate.semanticAttributes?.texture;
    if (texture?.value === preference.value && texture.confidence >= 0.7) score += preference.sentiment === 'like' ? 2 : -2;
  }
  return score;
}

/** Safety is checked before any candidate can enter the Jev shortlist. */
export function buildSemanticShortlist(
  original: Product, candidates: Product[], profile: NutritionalProfile,
  context: PersonalizationContext, topK = DEFAULT_SEMANTIC_SHORTLIST
): { products: Product[]; examined: number; safetyExcluded: number } {
  const dedup = new Map<string, { product: Product; score: number; safety: 'green' | 'grey' }>();
  let safetyExcluded = 0;
  const bounded = candidates.slice(0, 200);
  for (const product of bounded) {
    if (!product?.barcode || product.barcode === original.barcode) continue;
    const safety = assessCandidateSafety(product, profile);
    if (!safety.eligible) { safetyExcluded++; continue; }
    const score = preRankScore(original, product, context);
    const prior = dedup.get(product.barcode);
    if (!prior || score > prior.score) dedup.set(product.barcode, { product, score, safety: safety.safetyRating as 'green' | 'grey' });
  }
  const products = [...dedup.values()].sort((a, b) =>
    (a.safety === b.safety ? 0 : a.safety === 'green' ? -1 : 1) ||
    b.score - a.score || a.product.barcode.localeCompare(b.product.barcode)
  ).slice(0, semanticShortlistLimit(String(topK))).map(item => item.product);
  return { products, examined: bounded.length, safetyExcluded };
}
