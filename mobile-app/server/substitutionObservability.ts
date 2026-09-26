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

export interface SubstitutionMetricEvent {
  event: "product_substitution";
  outcome: SubstitutionMetricOutcome;
  durationMs: number;
  resultCount: number;
  emptyStateReason?: SubstitutionEmptyStateReason | null;
  ranking?: SubstitutionRankingMetrics;
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
    const safeEvent = {
      event: event.event,
      outcome: event.outcome,
      durationMs: Math.max(0, Math.round(event.durationMs)),
      resultCount: Math.max(0, Math.floor(event.resultCount)),
      emptyStateReason: event.emptyStateReason ?? null,
      ranking: event.ranking ?? null,
    };
    console.info("[substitution-metric]", JSON.stringify(safeEvent));
  }
}
