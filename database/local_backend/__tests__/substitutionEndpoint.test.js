const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const crypto = require("node:crypto");
const { createApp } = require("../server");
const { verifyFirebaseIdToken } = require("../middleware/firebaseAuth");

async function withServer(options, run) {
  const server = createApp({ substitutions: options }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function dependencies(overrides = {}) {
  return {
    authMiddleware(req, res, next) {
      if (req.get("authorization") !== "Bearer valid-token") return res.status(401).json({ error: "AUTH_REQUIRED" });
      req.auth = { uid: "user-1" };
      next();
    },
    rateLimitMiddleware(_req, _res, next) { next(); },
    profileRepository: {
      async getOwnedProfile({ uid, profileId }) {
        return uid === "user-1" && profileId === "profile-1" ? { userId: uid, profileId, allergies: ["Milk"] } : null;
      },
    },
    substitutionService: {
      getSubstitutions({ barcode, profile, limit, requestId }) {
        return {
          contractVersion: "1.0",
          status: "ok",
          source: { barcode, productName: "Bread", categoryKeys: ["breads"], profileConflicts: [] },
          substitutions: [],
          meta: { requestId, algorithmVersion: "be033-v1", candidateCount: 0, evaluatedCount: 0, returnedCount: 0 },
          observed: { profile, limit },
        };
      },
    },
    ...overrides,
  };
}

test("substitution endpoint rejects unauthenticated requests", async () => {
  await withServer(dependencies(), async (base) => {
    const response = await fetch(`${base}/api/v1/scan/substitutions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode: "10000001", profileId: "profile-1", limit: 5 }),
    });
    assert.equal(response.status, 401);
  });
});

test("endpoint loads the authenticated user's profile and enforces request bounds", async () => {
  await withServer(dependencies(), async (base) => {
    const response = await fetch(`${base}/api/v1/scan/substitutions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer valid-token", "x-request-id": "endpoint-test" },
      body: JSON.stringify({ barcode: "10000001", profileId: "profile-1", limit: 5 }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "endpoint-test");
    const body = await response.json();
    assert.equal(body.observed.profile.userId, "user-1");
    assert.equal(body.observed.limit, 5);

    const invalid = await fetch(`${base}/api/v1/scan/substitutions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer valid-token" },
      body: JSON.stringify({ barcode: "10000001", profileId: "profile-1", limit: 11 }),
    });
    assert.equal(invalid.status, 400);
  });
});

test("endpoint does not accept a profile owned by another account", async () => {
  await withServer(dependencies(), async (base) => {
    const response = await fetch(`${base}/api/v1/scan/substitutions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer valid-token" },
      body: JSON.stringify({ barcode: "10000001", profileId: "other-profile", limit: 5 }),
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "PROFILE_NOT_FOUND");
  });
});

test("Firebase verifier validates signature, issuer, audience and subject", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const payload = encode({
    aud: "test-project",
    iss: "https://securetoken.google.com/test-project",
    sub: "firebase-user",
    iat: now - 5,
    exp: now + 300,
  });
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  const token = `${header}.${payload}.${signature}`;
  const verified = await verifyFirebaseIdToken(token, {
    projectId: "test-project",
    certificates: { "test-key": publicKey.export({ type: "spki", format: "pem" }) },
  });
  assert.equal(verified.uid, "firebase-user");
  await assert.rejects(
    verifyFirebaseIdToken(token, { projectId: "wrong-project", certificates: { "test-key": publicKey.export({ type: "spki", format: "pem" }) } }),
    /audience or issuer/i
  );
});
