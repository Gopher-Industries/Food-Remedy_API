import { evaluateJevAlerts } from '@/server/jevAlerts';
import type { JevMetricEvent } from '@/server/substitutionObservability';

function event(overrides: Partial<JevMetricEvent> = {}): JevMetricEvent {
  return { mode: 'enabled', outcome: 'applied', candidateCount: 2, questionCount: 3,
    upstreamDurationMs: 250, confidenceBand: 'high', rankChangeCount: 1,
    modelVersion: 'jev-1.13.0', inputTokens: 100, outputTokens: 10,
    estimatedCostUsd: 0.001, actualCostUsd: 0.0001, ...overrides };
}

test('alerts immediately on budget breach but requires a sample for rate alerts', () => {
  expect(evaluateJevAlerts([event({ outcome: 'budget_exceeded', fallbackReason: 'cost_limit' })]))
    .toEqual(['BUDGET_BREACH']);
  expect(evaluateJevAlerts([event({ outcome: 'fallback', fallbackReason: 'timeout' })])).toEqual([]);
});

test('detects upstream, timeout, confidence, fallback and latency degradation in a 15-minute window', () => {
  const events = Array.from({ length: 100 }, (_, index) => index < 30
    ? event({ outcome: 'fallback', fallbackReason: index < 10 ? 'timeout' : 'upstream',
      confidenceBand: 'low', upstreamDurationMs: 2_000 }) : event());
  expect(evaluateJevAlerts(events)).toEqual([
    'UPSTREAM_ERROR_RATE', 'TIMEOUT_RATE', 'LOW_CONFIDENCE_RATE', 'FALLBACK_RATE', 'P95_LATENCY',
  ]);
});

test('excludes non-selected requests from the alert denominator', () => {
  const events = [event({ outcome: 'fallback', fallbackReason: 'timeout' }),
    ...Array.from({ length: 100 }, () => event({ mode: 'canary', outcome: 'canary_excluded' }))];
  expect(evaluateJevAlerts(events)).toEqual([]);
});
