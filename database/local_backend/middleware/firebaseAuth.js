const crypto = require("crypto");

const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificateCache = { expiresAt: 0, certificates: null };

function decodeSegment(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function cacheMaxAge(headers) {
  const match = String(headers.get("cache-control") || "").match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : 3600;
}

async function getCertificates(fetchImpl = fetch) {
  if (certificateCache.certificates && certificateCache.expiresAt > Date.now()) return certificateCache.certificates;
  const response = await fetchImpl(CERT_URL, {
    headers: { Accept: "application/json" },
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5000) : undefined
  });
  if (!response.ok) throw new Error(`Firebase certificate request failed (${response.status})`);
  const certificates = await response.json();
  certificateCache = { certificates, expiresAt: Date.now() + cacheMaxAge(response.headers) * 1000 };
  return certificates;
}

async function verifyFirebaseIdToken(token, options = {}) {
  const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) throw Object.assign(new Error("FIREBASE_PROJECT_ID is not configured"), { code: "AUTH_CONFIGURATION_ERROR" });
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("Malformed Firebase ID token");

  let header;
  let payload;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch {
    throw new Error("Malformed Firebase ID token");
  }
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Firebase ID token signature");

  const certificates = options.certificates || await getCertificates(options.fetchImpl);
  const certificate = certificates[header.kid];
  if (!certificate) throw new Error("Unknown Firebase ID token key");
  const validSignature = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    certificate,
    Buffer.from(parts[2], "base64url")
  );
  if (!validSignature) throw new Error("Invalid Firebase ID token signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Firebase ID token audience or issuer is invalid");
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) throw new Error("Firebase ID token subject is invalid");
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("Firebase ID token has expired");
  if (!Number.isFinite(payload.iat) || payload.iat > now + 300) throw new Error("Firebase ID token issue time is invalid");
  return { uid: payload.sub, email: payload.email || null, claims: payload };
}

function createFirebaseAuthMiddleware(options = {}) {
  const verify = options.verifyIdToken || ((token) => verifyFirebaseIdToken(token, options));
  return async function firebaseAuth(req, res, next) {
    const match = String(req.get("authorization") || "").match(/^Bearer\s+([^\s]+)$/i);
    if (!match || match[1].length > 8192) {
      return res.status(401).json({ error: "AUTH_REQUIRED", message: "A valid Firebase bearer token is required." });
    }
    try {
      req.auth = await verify(match[1]);
      return next();
    } catch (error) {
      options.logger?.warn?.(JSON.stringify({ event: "substitution.auth_rejected", reason: error.code || error.message }));
      return res.status(error.code === "AUTH_CONFIGURATION_ERROR" ? 503 : 401).json({
        error: error.code === "AUTH_CONFIGURATION_ERROR" ? "AUTH_UNAVAILABLE" : "INVALID_AUTH_TOKEN",
        message: error.code === "AUTH_CONFIGURATION_ERROR" ? "Authentication is temporarily unavailable." : "The Firebase bearer token is invalid or expired."
      });
    }
  };
}

module.exports = { createFirebaseAuthMiddleware, verifyFirebaseIdToken };
