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
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_SUBSTITUTION_BODY_BYTES) {
    throw new SubstitutionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SubstitutionValidationError("INVALID_REQUEST", "Request body must contain valid JSON.");
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
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
    if (error instanceof SubstitutionValidationError) throw error;
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request body could not be read.");
  } finally {
    reader.releaseLock();
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
