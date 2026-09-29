export interface AuthFixtureUser {
  uid: string | null;
  email?: string;
  token: string | null;
  expired?: boolean;
  revoked?: boolean;
}

export const OWNER_FIXTURE: AuthFixtureUser = {
  uid: "user_owner_123",
  email: "owner@foodremedy.com",
  token: "Bearer mock-jwt-token-owner-123",
};

export const ATTACKER_FIXTURE: AuthFixtureUser = {
  uid: "user_attacker_999",
  email: "attacker@foodremedy.com",
  token: "Bearer mock-jwt-token-attacker-999",
};

export const UNAUTHENTICATED_FIXTURE: AuthFixtureUser = {
  uid: null,
  token: null,
};

export const EXPIRED_TOKEN_FIXTURE: AuthFixtureUser = {
  uid: "user_owner_123",
  email: "owner@foodremedy.com",
  token: "Bearer mock-jwt-token-expired-123",
  expired: true,
};

export const REVOKED_TOKEN_FIXTURE: AuthFixtureUser = {
  uid: "user_owner_123",
  email: "owner@foodremedy.com",
  token: "Bearer mock-jwt-token-revoked-123",
  revoked: true,
};

export function createAuthHeader(fixture: AuthFixtureUser): Record<string, string> {
  if (!fixture.token) return {};
  return { Authorization: fixture.token };
}

export function parseToken(authHeader?: string | null): {
  valid: boolean;
  uid: string | null;
  expired: boolean;
  revoked: boolean;
  error?: string;
} {
  if (!authHeader) {
    return { valid: false, uid: null, expired: false, revoked: false, error: "UNAUTHORIZED" };
  }

  const tokenStr = authHeader.replace(/^Bearer\s+|^Firebase\s+/i, "").trim();

  if (tokenStr === "mock-jwt-token-owner-123") {
    return { valid: true, uid: OWNER_FIXTURE.uid, expired: false, revoked: false };
  }
  if (tokenStr === "mock-jwt-token-attacker-999") {
    return { valid: true, uid: ATTACKER_FIXTURE.uid, expired: false, revoked: false };
  }
  if (tokenStr === "mock-jwt-token-expired-123") {
    return { valid: false, uid: "user_owner_123", expired: true, revoked: false, error: "TOKEN_EXPIRED" };
  }
  if (tokenStr === "mock-jwt-token-revoked-123") {
    return { valid: false, uid: "user_owner_123", expired: false, revoked: true, error: "TOKEN_REVOKED" };
  }

  // Fallback for custom formatted mock tokens e.g. "valid-uid:xyz"
  if (tokenStr.startsWith("valid-")) {
    const uid = tokenStr.split("valid-")[1];
    return { valid: true, uid, expired: false, revoked: false };
  }

  return { valid: false, uid: null, expired: false, revoked: false, error: "UNAUTHORIZED" };
}

export function assertNonDisclosingErrorResponse(body: any, status: number) {
  // Must be 401 Unauthorized or 403 Forbidden or 404 Not Found
  expect([401, 403, 404]).toContain(status);
  expect(body).toBeDefined();

  // Non-enumeration checks: Must NOT disclose private email, user profile details, or sensitive internals
  const bodyString = JSON.stringify(body).toLowerCase();
  expect(bodyString).not.toContain("owner@foodremedy.com");
  expect(bodyString).not.toContain("user_owner_123");
  expect(bodyString).not.toContain("stacktrace");
  expect(bodyString).not.toContain("firestore");
}
