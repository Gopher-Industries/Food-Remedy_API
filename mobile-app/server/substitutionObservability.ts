import type { SubstitutionEmptyStateReason, SubstitutionRankingMetrics } from "@/services/substitutionEligibility";

export type SubstitutionRolloutMode = "enabled" | "canary" | "disabled";

export interface SubstitutionRollout {
  isEnabledFor(uid: string): boolean;
}

export class FeatureDisabledError extends Error {}

function boundedPercent(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.floor(parsed))) : 0;
}

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

/** Environment flag evaluated per request so a deployment can be rolled back without code changes. */
export class EnvironmentSubstitutionRollout implements SubstitutionRollout {
  constructor(private readonly environment: Record<string, string | undefined> = process.env) {}

  isEnabledFor(uid: string): boolean {
    const mode = this.environment.SUBSTITUTIONS_ROLLOUT as SubstitutionRolloutMode | undefined;
    // A missing production setting is fail-closed: enabling the route is an
    // explicit release decision, not an accidental default.
    if (mode === "enabled") return true;
    if (mode === undefined) return false;
    if (mode === "disabled") return false;
    if (mode !== "canary") return false;
    // The UID is used only in memory to produce a stable rollout decision and
    // is never added to a metric, response, or log.
    return stableBucket(`${this.environment.SUBSTITUTIONS_ROLLOUT_SALT ?? "substitutions-v1"}:${uid}`) < boundedPercent(this.environment.SUBSTITUTIONS_CANARY_PERCENT);
  }
}

export class EnabledSubstitutionRollout implements SubstitutionRollout {
  isEnabledFor(): boolean {
    return true;
  }
}

export type SubstitutionMetricOutcome =
  | "success"
  | "empty"
  | "unauthenticated"
  | "validation_error"
  | "feature_disabled"
  | "product_not_found"
  | "profile_unavailable"
  | "unavailable";

export interface JevMetricEvent {
  mode: 'disabled' | 'shadow' | 'canary' | 'enabled';
  outcome: 'disabled' | 'master_disabled' | 'config_unavailable' | 'config_invalid' |
    'approval_missing' | 'model_mismatch' | 'canary_excluded' | 'no_intention' | 'no_candidates' |
    'no_client' | 'budget_exceeded' | 'applied' | 'shadow' | 'fallback';
  candidateCount: number;
  questionCount: number;
  upstreamDurationMs: number;
  confidenceBand: 'none' | 'low' | 'medium' | 'high';
  fallbackReason?: string;
  rankChangeCount: number;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
}

export interface SubstitutionMetricEvent {
  event: "product_substitution";
  outcome: SubstitutionMetricOutcome;
  durationMs: number;
  resultCount: number;
  emptyStateReason?: SubstitutionEmptyStateReason | null;
  ranking?: SubstitutionRankingMetrics;
  jev?: JevMetricEvent;
}

export interface SubstitutionMetrics {
  record(event: SubstitutionMetricEvent): void;
}

export class NoopSubstitutionMetrics implements SubstitutionMetrics {
  record(): void {}
}

/** Emits aggregate-only structured events for a platform log-based dashboard. */
export class ConsoleSubstitutionMetrics implements SubstitutionMetrics {
  record(event: SubstitutionMetricEvent): void {
    const fallbackReasons = new Set(['incomplete', 'version_mismatch', 'low_confidence', 'unavailable',
      'timeout', 'rate_limited', 'authentication', 'connection', 'upstream', 'malformed',
      'busy', 'cancelled', 'cost_limit', 'candidate_limit', 'no_candidates']);
    const safeEvent = {
      event: event.event,
      outcome: event.outcome,
      durationMs: Math.max(0, Math.round(event.durationMs)),
      resultCount: Math.max(0, Math.floor(event.resultCount)),
      emptyStateReason: event.emptyStateReason ?? null,
      ranking: event.ranking ?? null,
      jev: event.jev ? {
        mode: event.jev.mode,
        outcome: event.jev.outcome,
        candidateCount: Math.max(0, Math.min(20, Math.floor(event.jev.candidateCount))),
        questionCount: Math.max(0, Math.min(5, Math.floor(event.jev.questionCount))),
        upstreamDurationMs: Math.max(0, Math.round(event.jev.upstreamDurationMs)),
        confidenceBand: event.jev.confidenceBand,
        fallbackReason: event.jev.fallbackReason && fallbackReasons.has(event.jev.fallbackReason)
          ? event.jev.fallbackReason : null,
        rankChangeCount: Math.max(0, Math.min(20, Math.floor(event.jev.rankChangeCount))),
        modelVersion: typeof event.jev.modelVersion === 'string' &&
          /^jev-\d+\.\d+\.\d+$/.test(event.jev.modelVersion) ? event.jev.modelVersion : null,
        inputTokens: Math.max(0, Math.floor(event.jev.inputTokens)),
        outputTokens: Math.max(0, Math.floor(event.jev.outputTokens)),
        estimatedCostUsd: Math.max(0, Math.round(event.jev.estimatedCostUsd * 1_000_000) / 1_000_000),
        actualCostUsd: Math.max(0, Math.round(event.jev.actualCostUsd * 1_000_000) / 1_000_000),
      } : null,
    };
    console.info("[substitution-metric]", JSON.stringify(safeEvent));
  }
}
