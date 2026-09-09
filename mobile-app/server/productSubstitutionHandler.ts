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
  validateSubstitutionRequest,
} from "@/server/productSubstitutionService";
import {
  AuthenticationError,
  requireVerifiedIdentity,
  type TokenVerifier,
} from "@/server/verifiedAuth";
import {
  EnabledSubstitutionRollout,
  FeatureDisabledError,
  NoopSubstitutionMetrics,
  type SubstitutionMetricOutcome,
  type SubstitutionMetrics,
  type SubstitutionRollout,
} from "@/server/substitutionObservability";

const DEFAULT_TIMEOUT_MS = 4_000;

export interface ProductSubstitutionHandlerDependencies {
  tokenVerifier: TokenVerifier;
  repository: ProductSubstitutionRepository;
  timeoutMs?: number;
  rollout?: SubstitutionRollout;
  metrics?: SubstitutionMetrics;
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return response({ version: SUBSTITUTION_CONTRACT_VERSION, error: { code, message } }, status);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SUBSTITUTION_BODY_BYTES) {
    throw new SubstitutionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }
  let body: string;
  try {
    body = await request.text();
  } catch {
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request body could not be read.");
  }
  if (new TextEncoder().encode(body).byteLength > MAX_SUBSTITUTION_BODY_BYTES) {
    throw new SubstitutionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request body must contain valid JSON.");
  }
}

function withDeadline<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new RequestCancelledError("Request was cancelled."));
      return;
    }
    const timer = setTimeout(() => reject(new SubstitutionTimeoutError("Request timed out.")), timeoutMs);
    const onAbort = () => reject(new RequestCancelledError("Request was cancelled."));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/** Testable POST handler for the authenticated substitutions v1 contract. */
export function createProductSubstitutionHandler(dependencies: ProductSubstitutionHandlerDependencies) {
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const rollout = dependencies.rollout ?? new EnabledSubstitutionRollout();
  const metrics = dependencies.metrics ?? new NoopSubstitutionMetrics();
  return async function postProductSubstitutions(request: Request): Promise<Response> {
    const startedAt = Date.now();
    let outcome: SubstitutionMetricOutcome = "unavailable";
    let resultCount = 0;
    let emptyStateReason: Parameters<SubstitutionMetrics["record"]>[0]["emptyStateReason"];
    let ranking: Parameters<SubstitutionMetrics["record"]>[0]["ranking"];
    try {
      const identity = await withDeadline(requireVerifiedIdentity(request, dependencies.tokenVerifier), request.signal, timeoutMs);
      if (!rollout.isEnabledFor(identity.uid)) throw new FeatureDisabledError("Substitutions are disabled.");
      const payload = await readBoundedJson(request);
      const input = validateSubstitutionRequest(payload);
      const execution = await withDeadline(
        executeProductSubstitution(dependencies.repository, identity.uid, input),
        request.signal,
        timeoutMs
      );
      resultCount = execution.response.substitutions.length;
      emptyStateReason = execution.response.emptyStateReason;
      ranking = execution.metrics;
      outcome = resultCount ? "success" : "empty";
      return response(execution.response, 200);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        outcome = "unauthenticated";
        return errorResponse("UNAUTHENTICATED", "Authentication is required.", 401);
      }
      if (error instanceof SubstitutionValidationError) {
        outcome = "validation_error";
        return errorResponse(error.code, error.message, error.code === "REQUEST_TOO_LARGE" ? 413 : 400);
      }
      if (error instanceof FeatureDisabledError) {
        outcome = "feature_disabled";
        return errorResponse("SUBSTITUTIONS_UNAVAILABLE", "Substitutions are temporarily unavailable. Please try again.", 503);
      }
      if (error instanceof ProductNotFoundError) {
        outcome = "product_not_found";
        return errorResponse("PRODUCT_NOT_FOUND", "The requested product was not found.", 404);
      }
      if (error instanceof ProfileUnavailableError) {
        outcome = "profile_unavailable";
        return errorResponse("PROFILE_UNAVAILABLE", "An active profile is required for substitutions.", 409);
      }
      // No error object is logged: upstream failures can contain profile or
      // product payloads that should never be exposed to callers or logs.
      return errorResponse("SUBSTITUTIONS_UNAVAILABLE", "Substitutions are temporarily unavailable. Please try again.", 503);
    } finally {
      metrics.record({
        event: "product_substitution",
        outcome,
        durationMs: Date.now() - startedAt,
        resultCount,
        emptyStateReason,
        ranking,
      });
    }
  };
}
