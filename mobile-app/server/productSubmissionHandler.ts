import {
  PRODUCT_SUBMISSIONS_CONTRACT_VERSION,
  MAX_SUBMISSION_BODY_BYTES,
  ProductAlreadyExistsError,
  type ProductSubmissionStore,
  SubmissionRateLimitError,
  SubmissionStorageTimeoutError,
  SubmissionValidationError,
  validateProductSubmission,
} from "@/server/productSubmissions";
import {
  AuthenticationError,
  requireVerifiedIdentity,
  type TokenVerifier,
} from "@/server/verifiedAuth";

export interface ProductSubmissionHandlerDependencies {
  tokenVerifier: TokenVerifier;
  submissionStore: ProductSubmissionStore;
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return response(
    {
      version: PRODUCT_SUBMISSIONS_CONTRACT_VERSION,
      error: { code, message },
    },
    status
  );
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SUBMISSION_BODY_BYTES) {
    throw new SubmissionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new SubmissionValidationError("INVALID_REQUEST", "Request body could not be read.");
  }

  if (new TextEncoder().encode(text).byteLength > MAX_SUBMISSION_BODY_BYTES) {
    throw new SubmissionValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new SubmissionValidationError("INVALID_REQUEST", "Request body must contain valid JSON.");
  }
}

/** Creates a testable POST handler for the v1 product-submission contract. */
export function createProductSubmissionHandler(
  dependencies: ProductSubmissionHandlerDependencies
) {
  return async function postProductSubmission(request: Request): Promise<Response> {
    try {
      const identity = await requireVerifiedIdentity(request, dependencies.tokenVerifier);
      const body = await readBoundedJson(request);
      const submission = validateProductSubmission(body);
      const result = await dependencies.submissionStore.submit(identity.uid, submission);

      return response(
        {
          version: PRODUCT_SUBMISSIONS_CONTRACT_VERSION,
          ...result,
        },
        result.idempotent ? 200 : 201
      );
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return errorResponse("UNAUTHENTICATED", "Authentication is required.", 401);
      }
      if (error instanceof SubmissionValidationError) {
        return errorResponse(error.code, error.message, error.code === "REQUEST_TOO_LARGE" ? 413 : 400);
      }
      if (error instanceof ProductAlreadyExistsError) {
        return errorResponse(
          "PRODUCT_ALREADY_EXISTS",
          "This barcode is already available in the product catalogue.",
          409
        );
      }
      if (error instanceof SubmissionRateLimitError) {
        return response(
          {
            version: PRODUCT_SUBMISSIONS_CONTRACT_VERSION,
            error: {
              code: "RATE_LIMITED",
              message: "Too many product submissions. Please try again later.",
            },
            retryAfterSeconds: error.retryAfterSeconds,
          },
          429
        );
      }
      if (error instanceof SubmissionStorageTimeoutError) {
        return errorResponse(
          "SUBMISSION_UNAVAILABLE",
          "Product submissions are temporarily unavailable. Please try again.",
          503
        );
      }

      // Deliberately do not log the error object: SDK errors may include
      // request data, and a product note is an untrusted user submission.
      return errorResponse(
        "SUBMISSION_UNAVAILABLE",
        "Product submissions are temporarily unavailable. Please try again.",
        503
      );
    }
  };
}
