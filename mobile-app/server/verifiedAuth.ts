export interface VerifiedIdentity {
  uid: string;
}

export interface TokenVerifier {
  verifyIdToken(token: string, checkRevoked?: boolean): Promise<VerifiedIdentity>;
}

export class AuthenticationError extends Error {}

/**
 * Verifies a Firebase ID token and returns only its UID. Callers must never
 * accept a UID from the JSON payload as an authorization decision.
 */
export async function requireVerifiedIdentity(
  request: Request,
  tokenVerifier: TokenVerifier
): Promise<VerifiedIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = match?.[1]?.trim();

  if (!token) throw new AuthenticationError("Missing bearer token.");

  try {
    const identity = await tokenVerifier.verifyIdToken(token, true);
    if (!identity?.uid || typeof identity.uid !== "string") {
      throw new AuthenticationError("Token did not contain a UID.");
    }
    return { uid: identity.uid };
  } catch {
    throw new AuthenticationError("Bearer token could not be verified.");
  }
}
