import type { Product } from '@/types/Product';
import type { NutritionalProfile } from '@/types/NutritionalProfile';
import { assessCandidateSafety } from '@/services/substitutionEligibility';
import { validateProductSemanticAttributes, PRODUCT_SEMANTIC_FIELDS } from '@/services/utils/productSemanticAttributes';
import { intendedOccasion, meaningfulCategories } from './hybridCandidateRetrieval';
import type { PersonalizationContext } from './personalizationContext';
import type { SemanticFitClient, SemanticFitRequest, SemanticFitResult,
  SemanticScoreQuestion } from './semanticFitClient';

export const SEMANTIC_STATE_VERSION = 'food-semantic-state-v1' as const;
export const SEMANTIC_QUESTION_SET_VERSION = 'food-fit-score-v1' as const;
export const MAX_EVALUATED_CANDIDATES = 20;
export const MAX_SEMANTIC_CONCURRENCY = 2;

export type SemanticDimension = 'functional_fit' | 'occasion_fit' | 'convenience_fit' |
  'preference_fit' | 'familiarity_fit';

const BASE_QUESTIONS: Record<'functional_fit' | 'occasion_fit' | 'convenience_fit', SemanticScoreQuestion> = {
  functional_fit: {
    instructions: 'How well can candidate replace original for the shopping intention as a food role? Judge function, not allergy, diet or nutrition safety.',
    criteria: [
      'Candidate cannot serve the original food role for this intention.',
      'Candidate serves only a small part of the original role and needs a different food to complete it.',
      'Candidate serves the main role, but the shopper must change how it is used or served.',
      'Candidate serves the same practical food role with little change to use or serving.',
    ],
  },
  occasion_fit: {
    instructions: 'How well does candidate suit the stated occasion, if any? Judge the situation and serving context, not medical or nutrition safety.',
    criteria: [
      'Candidate is impractical for the occasion or cannot be used in that setting.',
      'Candidate could be used only with major changes to the setting or meal plan.',
      'Candidate fits the occasion with a modest compromise in serving or timing.',
      'Candidate fits the occasion naturally in its usual serving form.',
    ],
  },
  convenience_fit: {
    instructions: 'How well does candidate meet the preparation, portability and handling needs stated in the intention? Ignore health restrictions.',
    criteria: [
      'Candidate requires preparation, storage or handling incompatible with the stated need.',
      'Candidate needs substantial extra preparation, equipment or cleanup.',
      'Candidate needs some manageable preparation or handling.',
      'Candidate can be used with the requested level of preparation and handling.',
    ],
  },
};

const PREFERENCE_QUESTION: SemanticScoreQuestion = {
  instructions: 'How well do the candidate properties align with the explicitly liked/avoided or observed taste and texture signals? User declarations have priority; do not infer medical restrictions.',
  criteria: [
    'Candidate clearly conflicts with a declared avoidance or several strong preference signals.',
    'Candidate has a material preference conflict with little supporting match.',
    'Candidate has a partial match with some unknown or mixed preference evidence.',
    'Candidate aligns with the relevant declared preferences and supported observations.',
  ],
};

const FAMILIARITY_QUESTION: SemanticScoreQuestion = {
  instructions: 'How well does candidate meet the household familiarity preference? Use the provided preference and food descriptions; do not assume purchase history or safety.',
  criteria: [
    'Candidate is far outside the stated familiarity preference.',
    'Candidate differs noticeably from familiar foods for this household preference.',
    'Candidate is reasonably familiar or a modest novelty for the stated preference.',
    'Candidate closely matches the stated level of familiarity or adventurousness.',
  ],
};

function compactText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().replace(/\s+/g, ' ');
  return text ? [...text].slice(0, maximum).join('') : null;
}

function safeIntention(context: PersonalizationContext): string | null {
  const text = compactText(context.intention?.text, 240);
  // A saved intention is free text. Withhold the whole value when it may carry
  // a health restriction; the structured occasion/convenience remain available.
  if (!text || /\b(allerg\w*|anaphylax\w*|intoleran\w*|medical|disease|diabet\w*|coeliac|celiac|lactose|renal|kidney|pregnan\w*|medication|blood\s+sugar|low[ -]sodium|free[ -]from|cannot eat|can't eat|must avoid|(?:without|no|avoid)\s+(?:(?:any|all|the|a)\s+)?(?:milk|dairy|egg|peanuts?|nuts?|soy|wheat|gluten|shellfish|fish|sesame|sulphites?|additives?|vegan|vegetarian)|(?:milk|dairy|egg|peanuts?|nuts?|soy|wheat|gluten|shellfish|fish|sesame|sulphites?|additives?)[ -]free)\b/i.test(text)) return null;
  return text;
}

function semanticValues(product: Product): Record<string, { value: string; confidence: number }> {
  const block = validateProductSemanticAttributes(product.semanticAttributes);
  if (!block) return {};
  return Object.fromEntries(PRODUCT_SEMANTIC_FIELDS.flatMap(field => {
    const attribute = block[field];
    return attribute ? [[field, { value: attribute.value, confidence: attribute.confidence }]] : [];
  }));
}

function safeProduct(product: Product) {
  return {
    name: compactText(product.productName, 160),
    genericName: compactText(product.genericName, 120),
    categories: meaningfulCategories(product),
    semanticAttributes: semanticValues(product),
  };
}

/** Only ranking context goes to Jev: no barcodes, labels, nutrition or safety fields. */
export function buildSemanticFitState(original: Product, candidate: Product, context: PersonalizationContext) {
  return {
    schemaVersion: SEMANTIC_STATE_VERSION,
    original: safeProduct(original),
    candidate: safeProduct(candidate),
    intention: { text: safeIntention(context), occasion: intendedOccasion(context),
      convenience: context.intention?.convenience ?? null },
    preferences: {
      explicit: context.explicit.map(item => ({ dimension: item.dimension, value: item.value, sentiment: item.sentiment })),
      observed: context.observed.map(item => ({ dimension: item.dimension, value: item.value,
        sentiment: item.sentiment, strength: item.strength })),
    },
  };
}

export function semanticFitQuestions(context: PersonalizationContext): Record<string, SemanticScoreQuestion> {
  const questions: Record<string, SemanticScoreQuestion> = { ...BASE_QUESTIONS };
  const hasPreference = context.explicit.some(item => item.dimension !== 'familiarity') ||
    context.observed.some(item => item.dimension !== 'familiarity');
  if (hasPreference) questions.preference_fit = PREFERENCE_QUESTION;
  if (context.explicit.some(item => item.dimension === 'familiarity')) questions.familiarity_fit = FAMILIARITY_QUESTION;
  return questions;
}

export type SemanticDimensionResult =
  | { status: 'applied'; normalizedScore: number; rawScore: number; confidence: number;
      probabilities: Record<string, number> }
  | { status: 'not_applied' };

export type CandidateSemanticEvaluation =
  | { available: true; barcode: string; stateVersion: typeof SEMANTIC_STATE_VERSION;
      questionSetVersion: typeof SEMANTIC_QUESTION_SET_VERSION; model: string;
      dimensions: Record<SemanticDimension, SemanticDimensionResult>;
      acceptanceLikelihood: 'not_applied'; usage: { inputTokens: number; outputTokens: number }; durationMs: number }
  | { available: false; barcode: string; reason: Extract<SemanticFitResult, { available: false }>['reason'] };

function appliedDimensions(result: Extract<SemanticFitResult, { available: true }>,
  questions: Record<string, SemanticScoreQuestion>): Record<SemanticDimension, SemanticDimensionResult> {
  const dimensions = Object.fromEntries((['functional_fit', 'occasion_fit', 'convenience_fit',
    'preference_fit', 'familiarity_fit'] as SemanticDimension[]).map(dimension => {
      const answer = result.answers[dimension];
      return [dimension, answer && questions[dimension]
        ? { status: 'applied', normalizedScore: answer.score / (questions[dimension].criteria.length - 1),
          rawScore: answer.score, confidence: answer.confidence, probabilities: answer.probabilities }
        : { status: 'not_applied' }];
    })) as Record<SemanticDimension, SemanticDimensionResult>;
  return dimensions;
}

/** Recheck deterministic safety before issuing one batched System One call per candidate. */
export async function evaluateSemanticShortlist(
  client: SemanticFitClient, original: Product, candidates: Product[], profile: NutritionalProfile,
  context: PersonalizationContext, signal?: AbortSignal
): Promise<CandidateSemanticEvaluation[]> {
  const seen = new Set<string>();
  const eligible = candidates.slice(0, 200).filter(candidate => {
    if (!candidate?.barcode || candidate.barcode === original.barcode || seen.has(candidate.barcode)) return false;
    seen.add(candidate.barcode);
    return assessCandidateSafety(candidate, profile).eligible;
  }).slice(0, MAX_EVALUATED_CANDIDATES);
  const questions = semanticFitQuestions(context);
  const results: CandidateSemanticEvaluation[] = new Array(eligible.length);
  let next = 0;
  const worker = async () => {
    while (next < eligible.length) {
      const index = next++;
      const candidate = eligible[index];
      if (signal?.aborted) { results[index] = { available: false, barcode: candidate.barcode, reason: 'cancelled' }; continue; }
      const request: SemanticFitRequest = { state: buildSemanticFitState(original, candidate, context), questions };
      const evaluation = await client.evaluate(request, signal);
      results[index] = evaluation.available ? {
        available: true, barcode: candidate.barcode, stateVersion: SEMANTIC_STATE_VERSION,
        questionSetVersion: SEMANTIC_QUESTION_SET_VERSION, model: evaluation.model,
        dimensions: appliedDimensions(evaluation, questions), acceptanceLikelihood: 'not_applied',
        usage: evaluation.usage, durationMs: evaluation.durationMs,
      } : { available: false, barcode: candidate.barcode, reason: evaluation.reason };
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_SEMANTIC_CONCURRENCY, eligible.length) }, worker));
  return results;
}
