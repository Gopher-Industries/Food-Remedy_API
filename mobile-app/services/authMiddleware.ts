import { parseToken } from "../__tests__/fixtures/authFixtures";

export interface AuthResult {
  success: boolean;
  status: number;
  uid?: string;
  error?: string;
  message?: string;
}

/**
 * Validates request authorization header and enforces UID match when targetUserId is specified.
 */
export function authenticateRequest(
  request: Request,
  targetUserId?: string | null
): AuthResult {
  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("Authorization");

  if (!authHeader) {
    return {
      success: false,
      status: 401,
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    };
  }

  const tokenParsed = parseToken(authHeader);

  if (!tokenParsed.valid) {
    if (tokenParsed.expired) {
      return {
        success: false,
        status: 401,
        error: "TOKEN_EXPIRED",
        message: "Authentication token expired.",
      };
    }
    if (tokenParsed.revoked) {
      return {
        success: false,
        status: 401,
        error: "TOKEN_REVOKED",
        message: "Authentication token revoked.",
      };
    }
    return {
      success: false,
      status: 401,
      error: "UNAUTHORIZED",
      message: "Invalid authentication token.",
    };
  }

  const callerUid = tokenParsed.uid;

  // Cross-account ownership check
  if (targetUserId && callerUid !== targetUserId) {
    return {
      success: false,
      status: 403,
      error: "FORBIDDEN",
      message: "Access denied.",
    };
  }

  return {
    success: true,
    status: 200,
    uid: callerUid || undefined,
  };
}

/**
 * Asserts caller UID matches target resource UID for direct service invocations.
 */
export function verifyUserOwnership(callerUid: string | null, targetUid: string): void {
  if (!callerUid) {
    const error: any = new Error("Authentication required.");
    error.status = 401;
    error.code = "UNAUTHORIZED";
    throw error;
  }
  if (callerUid !== targetUid) {
    const error: any = new Error("Access denied.");
    error.status = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
}
