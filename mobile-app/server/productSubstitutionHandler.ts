import {
  createProductSubstitutionResponse,
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

const DEFAULT_TIMEOUT_MS = 4_000;

export interface ProductSubstitutionHandlerDependencies {
  tokenVerifier: TokenVerifier;
  repository: ProductSubstitutionRepository;
  timeoutMs?: number;
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
  return async function postProductSubstitutions(request: Request): Promise<Response> {
    try {
      const identity = await withDeadline(requireVerifiedIdentity(request, dependencies.tokenVerifier), request.signal, timeoutMs);
      const payload = await readBoundedJson(request);
      const input = validateSubstitutionRequest(payload);
      const result = await withDeadline(
        createProductSubstitutionResponse(dependencies.repository, identity.uid, input),
        request.signal,
        timeoutMs
      );
      return response(result, 200);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse("UNAUTHENTICATED", "Authentication is required.", 401);
      if (error instanceof SubstitutionValidationError) {
        return errorResponse(error.code, error.message, error.code === "REQUEST_TOO_LARGE" ? 413 : 400);
      }
      if (error instanceof ProductNotFoundError) return errorResponse("PRODUCT_NOT_FOUND", "The requested product was not found.", 404);
      if (error instanceof ProfileUnavailableError) return errorResponse("PROFILE_UNAVAILABLE", "An active profile is required for substitutions.", 409);
      // No error object is logged: upstream failures can contain profile or
      // product payloads that should never be exposed to callers or logs.
      return errorResponse("SUBSTITUTIONS_UNAVAILABLE", "Substitutions are temporarily unavailable. Please try again.", 503);
    }
  };
}
