import { buildSemanticFitState, semanticFitQuestions } from './semanticFitEvaluator';
import { semanticComparisonCandidates, type ProductSubstitutionV2Execution } from './productSubstitutionV2';
import type { JevBudget } from './jevRollout';

/** The provider may bill a failed retry; reserve two attempts before making any call. */
const BILLABLE_ATTEMPT_CEILING = 2;
const OUTPUT_TOKEN_ALLOWANCE_PER_QUESTION = 256;

export interface JevBudgetAssessment {
  allowed: boolean;
  reason: 'within_budget' | 'candidate_limit' | 'cost_limit' | 'no_candidates';
  candidateCount: number;
  questionCount: number;
  estimatedCostUsd: number;
}

export function estimateJevCost(inputTokens: number, outputTokens: number, budget: JevBudget): number {
  return (inputTokens * budget.inputUsdPerMillion + outputTokens * budget.outputUsdPerMillion) / 1_000_000;
}

/** Byte length is a deliberately conservative input-token estimate, including question text. */
export function assessJevRequestBudget(execution: ProductSubstitutionV2Execution,
  budget: JevBudget): JevBudgetAssessment {
  const candidates = semanticComparisonCandidates(execution.original, execution.eligible,
    execution.semanticShortlist, execution.profile);
  const questions = semanticFitQuestions(execution.context);
  const questionCount = Object.keys(questions).length;
  const candidateCount = candidates.length;
  if (!candidateCount) return { allowed: false, reason: 'no_candidates', candidateCount,
    questionCount, estimatedCostUsd: 0 };
  if (candidateCount > budget.maxCandidates) return { allowed: false, reason: 'candidate_limit',
    candidateCount, questionCount, estimatedCostUsd: 0 };
  const inputByteEstimate = candidates.reduce((sum, item) => sum + new TextEncoder().encode(JSON.stringify({
    state: buildSemanticFitState(execution.original, item.product, execution.context), questions,
  })).byteLength, 0);
  const outputAllowance = candidateCount * questionCount * OUTPUT_TOKEN_ALLOWANCE_PER_QUESTION;
  const estimatedCostUsd = estimateJevCost(inputByteEstimate * BILLABLE_ATTEMPT_CEILING,
    outputAllowance * BILLABLE_ATTEMPT_CEILING, budget);
  return { allowed: estimatedCostUsd <= budget.maxEstimatedCostUsd,
    reason: estimatedCostUsd <= budget.maxEstimatedCostUsd ? 'within_budget' : 'cost_limit',
    candidateCount, questionCount, estimatedCostUsd };
}
