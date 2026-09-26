import {
  executeProductSubstitution,
  MAX_SUBSTITUTION_BODY_BYTES,
  ProductNotFoundError,
  ProfileUnavailableError,
  RequestCancelledError,
  SUBSTITUTION_CONTRACT_VERSION,
  SubstitutionTimeoutError,
  SubstitutionValidationError,
  type ProductSubstitutionRepository,
  type ProductSubstitutionExecution,
  validateSubstitutionRequest,
} from "@/server/productSubstitutionService";
import {
  AuthenticationError,
  requireVerifiedIdentity,
  type TokenVerifier,
} from "@/server/verifiedAuth";
import {
  EnvironmentSubstitutionRollout,
  FeatureDisabledError,
  NoopSubstitutionMetrics,
  type SubstitutionMetricOutcome,
  type SubstitutionMetrics, type JevMetricEvent,
  type SubstitutionRollout,
} from "@/server/substitutionObservability";
import type { RecommendationSessionStore } from '@/server/recommendationEvidenceRepository';
import { PersonalizationContextUnavailableError, type PersonalizationContextRepository } from './personalizationContext';
import { applySemanticRankingV2, executeProductSubstitutionV2, SUBSTITUTION_CONTRACT_VERSION_V2, validateSubstitutionRequestV2,
  type ProductSubstitutionV2Execution } from './productSubstitutionV2';
import type { SemanticFitClient } from './semanticFitClient';
import type { JevDecision, JevRollout } from './jevRollout';
import { assessJevRequestBudget, estimateJevCost } from './jevRequestBudget';

const DEFAULT_TIMEOUT_MS = 4_000;

export interface ProductSubstitutionHandlerDependencies {
  tokenVerifier: TokenVerifier;
  repository: ProductSubstitutionRepository;
  timeoutMs?: number;
  rollout?: SubstitutionRollout;
  metrics?: SubstitutionMetrics;
  sessionStore?: RecommendationSessionStore;
  contextRepository?: PersonalizationContextRepository;
  /** Wired for BE066/BE067; BE065 does not evaluate or alter ordering. */
  semanticClient?: SemanticFitClient;
  semanticEnabled?: boolean;
  jevRollout?: JevRollout;
}

function initialJevMetric(mode: JevMetricEvent['mode'], outcome: JevMetricEvent['outcome']): JevMetricEvent {
  return { mode, outcome, candidateCount: 0, questionCount: 0, upstreamDurationMs: 0,
    confidenceBand: 'none', rankChangeCount: 0, inputTokens: 0, outputTokens: 0,
    estimatedCostUsd: 0, actualCostUsd: 0 };
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorResponse(code: string, message: string, status: number, version: string): Response {
  return response({ version, error: { code, message } }, status);
}

async function readBoundedJson(request: Request, timeoutMs: number): Promise<unknown> {
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_SUBSTITUTION_BODY_BYTES) {
    throw new SubstitutionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }
  if (request.signal.aborted) throw new RequestCancelledError("Request was cancelled.");
  const reader = request.body?.getReader();
  if (!reader) throw new SubstitutionValidationError("INVALID_REQUEST", "Request body must contain valid JSON.");
  let rejectInterrupted: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
  const interrupt = (error: Error) => {
    rejectInterrupted(error);
    void reader.cancel().catch(() => {});
  };
  const onAbort = () => interrupt(new RequestCancelledError("Request was cancelled."));
  const timer = setTimeout(() => interrupt(new SubstitutionTimeoutError("Request timed out.")), timeoutMs);
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) onAbort();
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SUBSTITUTION_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* The size limit still applies. */ }
        throw new SubstitutionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof SubstitutionValidationError || error instanceof SubstitutionTimeoutError || error instanceof RequestCancelledError) throw error;
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request body could not be read.");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* Cancellation can leave a read pending briefly. */ }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request body must contain valid JSON.");
  }
}

function remainingMs(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new SubstitutionTimeoutError("Request timed out.");
  return remaining;
}

function withDeadline<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new RequestCancelledError("Request was cancelled."));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new RequestCancelledError("Request was cancelled."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new SubstitutionTimeoutError("Request timed out."));
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    operation.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); }
    );
  });
}

/** Testable POST handler for the authenticated substitutions v1 contract. */
export function createProductSubstitutionHandler(dependencies: ProductSubstitutionHandlerDependencies) {
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const rollout = dependencies.rollout ?? new EnvironmentSubstitutionRollout();
  const metrics = dependencies.metrics ?? new NoopSubstitutionMetrics();
  return async function postProductSubstitutions(request: Request): Promise<Response> {
    const deadline = Date.now() + timeoutMs;
    const startedAt = Date.now();
    let outcome: SubstitutionMetricOutcome = "unavailable";
    let resultCount = 0;
    let emptyStateReason: Parameters<SubstitutionMetrics["record"]>[0]["emptyStateReason"];
    let ranking: Parameters<SubstitutionMetrics["record"]>[0]["ranking"];
    let responseVersion: string = SUBSTITUTION_CONTRACT_VERSION;
    let jevMetric: JevMetricEvent | undefined;
    try {
      const identity = await withDeadline(requireVerifiedIdentity(request, dependencies.tokenVerifier), request.signal, remainingMs(deadline));
      if (!rollout.isEnabledFor(identity.uid)) throw new FeatureDisabledError("Substitutions are disabled.");
      const payload = await readBoundedJson(request, remainingMs(deadline));
      const isV2 = !!payload && typeof payload === 'object' && !Array.isArray(payload) &&
        (payload as { version?: unknown }).version === SUBSTITUTION_CONTRACT_VERSION_V2;
      responseVersion = isV2 ? SUBSTITUTION_CONTRACT_VERSION_V2 : SUBSTITUTION_CONTRACT_VERSION;
      const input = isV2 ? validateSubstitutionRequestV2(payload) : validateSubstitutionRequest(payload);
      if (isV2 && !dependencies.contextRepository) throw new ProfileUnavailableError('Profile unavailable.');
      const execution = await withDeadline<ProductSubstitutionExecution | ProductSubstitutionV2Execution>(isV2
        ? executeProductSubstitutionV2(dependencies.repository, dependencies.contextRepository!, identity.uid, input as ReturnType<typeof validateSubstitutionRequestV2>)
        : executeProductSubstitution(dependencies.repository, identity.uid, input as ReturnType<typeof validateSubstitutionRequest>),
      request.signal, remainingMs(deadline));
      if (isV2 && 'context' in execution) {
        let decision: JevDecision;
        if (dependencies.jevRollout) {
          try {
            decision = await withDeadline(dependencies.jevRollout.resolve(identity.uid), request.signal,
              Math.max(1, deadline - Date.now()));
          } catch {
            if (request.signal.aborted) throw new RequestCancelledError("Request was cancelled.");
            decision = { mode: 'disabled', reason: 'config_unavailable', runSemantic: false, applySemantic: false };
          }
        } else {
          // Compatibility for in-process callers; the production route always supplies jevRollout.
          decision = dependencies.semanticEnabled
            ? { mode: 'enabled', reason: 'selected', runSemantic: true, applySemantic: true }
            : { mode: 'disabled', reason: 'disabled', runSemantic: false, applySemantic: false };
        }
        jevMetric = initialJevMetric(decision.mode,
          decision.reason === 'selected' ? 'no_intention' : decision.reason);
        if (decision.runSemantic && execution.context.intention && !execution.response.substitutions.length) {
          jevMetric.outcome = 'no_candidates';
        }
        if (decision.runSemantic && execution.context.intention && execution.response.substitutions.length) {
          if (!dependencies.semanticClient) jevMetric.outcome = 'no_client';
          else {
            const assessment = decision.budget ? assessJevRequestBudget(execution, decision.budget) : null;
            if (assessment) {
              jevMetric.candidateCount = assessment.candidateCount;
              jevMetric.questionCount = assessment.questionCount;
              jevMetric.estimatedCostUsd = assessment.estimatedCostUsd;
            }
            if (assessment && !assessment.allowed) {
              jevMetric.outcome = 'budget_exceeded';
              jevMetric.fallbackReason = assessment.reason;
              if (decision.applySemantic) execution.response = { ...execution.response, rankingReasonCode: 'SEMANTIC_FALLBACK' };
            } else {
              const remaining = deadline - Date.now();
              const baselineResponse = execution.response;
              if (remaining > 100) {
                const controller = new AbortController();
                const abort = () => controller.abort();
                request.signal.addEventListener('abort', abort, { once: true });
                const timer = setTimeout(abort, remaining);
                const jevStarted = Date.now();
                try {
                  await withDeadline(applySemanticRankingV2(execution, dependencies.semanticClient, controller.signal),
                    request.signal, remaining);
                } catch {
                  if (request.signal.aborted) throw new RequestCancelledError("Request was cancelled.");
                  execution.response = { ...baselineResponse, rankingReasonCode: 'SEMANTIC_FALLBACK' };
                  execution.semanticFallbackReason = 'unavailable';
                } finally {
                  clearTimeout(timer);
                  request.signal.removeEventListener('abort', abort);
                  jevMetric.upstreamDurationMs = Date.now() - jevStarted;
                }
                if (execution.semanticTelemetry) {
                  const detail = execution.semanticTelemetry;
                  jevMetric.candidateCount = detail.candidateCount;
                  jevMetric.questionCount = detail.questionCount || jevMetric.questionCount;
                  jevMetric.inputTokens = detail.inputTokens;
                  jevMetric.outputTokens = detail.outputTokens;
                  jevMetric.confidenceBand = detail.confidenceBand;
                  jevMetric.rankChangeCount = detail.rankChangeCount;
                  jevMetric.fallbackReason = detail.fallbackReason;
                  jevMetric.modelVersion = execution.semanticModel ?? decision.modelVersion;
                  if (decision.budget) {
                    jevMetric.actualCostUsd = estimateJevCost(detail.inputTokens, detail.outputTokens, decision.budget);
                  }
                }
                if (decision.budget && jevMetric.actualCostUsd > decision.budget.maxEstimatedCostUsd) {
                  execution.response = { ...baselineResponse, rankingReasonCode: 'SEMANTIC_FALLBACK' };
                  jevMetric.outcome = 'budget_exceeded';
                  jevMetric.fallbackReason = 'cost_limit';
                } else if (decision.modelVersion && execution.semanticModel && execution.semanticModel !== decision.modelVersion) {
                  execution.response = { ...baselineResponse, rankingReasonCode: 'SEMANTIC_FALLBACK' };
                  jevMetric.outcome = 'model_mismatch';
                } else if (!decision.applySemantic) {
                  jevMetric.outcome = 'shadow';
                  execution.response = baselineResponse;
                } else {
                  jevMetric.outcome = execution.response.rankingMode === 'semantic' ? 'applied' : 'fallback';
                  jevMetric.fallbackReason ??= execution.semanticFallbackReason;
                }
              } else {
                jevMetric.outcome = 'fallback';
                jevMetric.fallbackReason = 'timeout';
                if (decision.applySemantic) execution.response = { ...baselineResponse, rankingReasonCode: 'SEMANTIC_FALLBACK' };
              }
            }
          }
        }
      }
      resultCount = execution.response.substitutions.length;
      emptyStateReason = execution.response.emptyStateReason;
      ranking = execution.metrics;
      outcome = resultCount ? "success" : "empty";
      if (resultCount && dependencies.sessionStore) {
        try {
          const remainingMs = timeoutMs - (Date.now() - startedAt);
          if (remainingMs > 0) {
            const sessionId = await withDeadline(dependencies.sessionStore.create(identity.uid, {
              profileId: execution.profileId,
              originalBarcode: input.barcode,
              candidates: execution.response.substitutions.map(item => ({
                barcode: item.barcode, deterministicScore: 'deterministicScore' in item ? Number(item.deterministicScore) : item.confidenceScore,
                ...('semanticScore' in item && item.semanticScore !== null ? { semanticScore: Number(item.semanticScore) } : {}),
              })),
              ...('context' in execution && execution.response.rankingMode === 'semantic' ? {
                rankingMode: 'semantic' as const,
                modelVersion: execution.semanticModel,
                policyVersion: execution.semanticPolicyVersion,
                questionSetVersion: execution.semanticQuestionSetVersion,
              } : {}),
            }), request.signal, remainingMs);
            return response({ ...execution.response, recommendationSessionId: sessionId }, 200);
          }
        } catch {
          // Evidence capture is optional; deterministic recommendations stay available.
        }
      }
      return response(execution.response, 200);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        outcome = "unauthenticated";
        return errorResponse("UNAUTHENTICATED", "Authentication is required.", 401, responseVersion);
      }
      if (error instanceof SubstitutionValidationError) {
        outcome = "validation_error";
        return errorResponse(error.code, error.message, error.code === "REQUEST_TOO_LARGE" ? 413 : 400, responseVersion);
      }
      if (error instanceof FeatureDisabledError) {
        outcome = "feature_disabled";
        return errorResponse("SUBSTITUTIONS_UNAVAILABLE", "Substitutions are temporarily unavailable. Please try again.", 503, responseVersion);
      }
      if (error instanceof ProductNotFoundError) {
        outcome = "product_not_found";
        return errorResponse("PRODUCT_NOT_FOUND", "The requested product was not found.", 404, responseVersion);
      }
      if (error instanceof ProfileUnavailableError || error instanceof PersonalizationContextUnavailableError) {
        outcome = "profile_unavailable";
        return errorResponse("PROFILE_UNAVAILABLE", "An active profile is required for substitutions.", 409, responseVersion);
      }
      // No error object is logged: upstream failures can contain profile or
      // product payloads that should never be exposed to callers or logs.
      return errorResponse("SUBSTITUTIONS_UNAVAILABLE", "Substitutions are temporarily unavailable. Please try again.", 503, responseVersion);
    } finally {
      try {
        metrics.record({
          event: "product_substitution",
          outcome,
          durationMs: Date.now() - startedAt,
          resultCount,
          emptyStateReason,
          ranking,
          jev: jevMetric,
        });
      } catch {
        // An unavailable metrics sink must never change the API response.
      }
    }
  };
}
