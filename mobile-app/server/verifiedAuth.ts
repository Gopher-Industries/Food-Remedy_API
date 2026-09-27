export interface VerifiedIdentity {
  uid: string;
}

export interface TokenVerifier {
  verifyIdToken(token: string, checkRevoked?: boolean): Promise<VerifiedIdentity>;
}

export class AuthenticationError extends Error {}

/** Verifies Firebase authentication and never trusts a request-body identity. */
export async function requireVerifiedIdentity(request: Request, tokenVerifier: TokenVerifier): Promise<VerifiedIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token) throw new AuthenticationError("Missing bearer token.");
  try {
    const identity = await tokenVerifier.verifyIdToken(token, true);
    if (!identity?.uid || typeof identity.uid !== "string") throw new AuthenticationError("Token did not contain a UID.");
    return { uid: identity.uid };
  } catch {
    throw new AuthenticationError("Bearer token could not be verified.");
  }
}
