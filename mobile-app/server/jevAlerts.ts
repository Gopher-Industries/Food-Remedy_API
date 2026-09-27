import type { JevMetricEvent } from './substitutionObservability';

export type JevAlertCode = 'BUDGET_BREACH' | 'UPSTREAM_ERROR_RATE' | 'TIMEOUT_RATE' |
  'LOW_CONFIDENCE_RATE' | 'FALLBACK_RATE' | 'P95_LATENCY';

export const JEV_ALERT_POLICY_VERSION = 'jev-alerts-v1';
export const JEV_ALERT_MIN_SELECTED_REQUESTS = 100;

/** Aggregate-only policy for a central 15-minute log window. No identifier or request body is an input. */
export function evaluateJevAlerts(events: readonly JevMetricEvent[]): JevAlertCode[] {
  const selectedOutcomes = new Set(['applied', 'shadow', 'fallback', 'budget_exceeded']);
  const selected = events.filter(item => selectedOutcomes.has(item.outcome) ||
    (item.outcome === 'model_mismatch' && item.upstreamDurationMs > 0));
  const alerts: JevAlertCode[] = [];
  if (selected.some(item => item.outcome === 'budget_exceeded')) alerts.push('BUDGET_BREACH');
  if (selected.length < JEV_ALERT_MIN_SELECTED_REQUESTS) return alerts;
  const share = (predicate: (event: JevMetricEvent) => boolean) => selected.filter(predicate).length / selected.length;
  const upstreamFailures = new Set(['unavailable', 'timeout', 'rate_limited', 'authentication',
    'connection', 'upstream', 'malformed', 'busy']);
  if (share(item => item.fallbackReason !== undefined && upstreamFailures.has(item.fallbackReason)) > 0.05) {
    alerts.push('UPSTREAM_ERROR_RATE');
  }
  if (share(item => item.fallbackReason === 'timeout') > 0.02) alerts.push('TIMEOUT_RATE');
  if (share(item => item.confidenceBand === 'low') > 0.25) alerts.push('LOW_CONFIDENCE_RATE');
  if (share(item => item.outcome === 'fallback' || item.outcome === 'budget_exceeded' ||
      item.outcome === 'model_mismatch') > 0.20) {
    alerts.push('FALLBACK_RATE');
  }
  const durations = selected.filter(item => item.upstreamDurationMs > 0)
    .map(item => item.upstreamDurationMs).sort((a, b) => a - b);
  if (durations.length && durations[Math.ceil(durations.length * 0.95) - 1] > 1_800) alerts.push('P95_LATENCY');
  return alerts;
}
