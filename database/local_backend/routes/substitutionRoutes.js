const express = require("express");
const crypto = require("crypto");
const { createFirebaseAuthMiddleware } = require("../middleware/firebaseAuth");
const { createUserRateLimit } = require("../middleware/rateLimit");
const { createFirebaseProfileRepository } = require("../substitutions/firebaseProfileRepository");
const { createSubstitutionService, MAX_LIMIT } = require("../substitutions/substitutionService");

function rolloutBucket(uid) {
  return crypto.createHash("sha256").update(uid).digest().readUInt32BE(0) % 100;
}

function createSubstitutionRouter(options = {}) {
  const router = express.Router();
  const logger = options.logger || console;
  const auth = options.authMiddleware || createFirebaseAuthMiddleware({ ...options.authOptions, logger });
  const rateLimit = options.rateLimitMiddleware || createUserRateLimit(options.rateLimitOptions);
  const profiles = options.profileRepository || createFirebaseProfileRepository(options.profileOptions);
  const service = options.substitutionService || createSubstitutionService({ logger });

  router.post("/", auth, rateLimit, async (req, res) => {
    const requestIdHeader = String(req.get("x-request-id") || "");
    const requestId = /^[a-zA-Z0-9._-]{1,100}$/.test(requestIdHeader) ? requestIdHeader : crypto.randomUUID();
    res.set("X-Request-Id", requestId);

    const enabled = String(process.env.SUBSTITUTIONS_ENABLED || "true").toLowerCase() !== "false";
    const rolloutPercent = Math.max(0, Math.min(100, Number(process.env.SUBSTITUTIONS_ROLLOUT_PERCENT ?? 100)));
    if (!enabled || rolloutBucket(req.auth.uid) >= rolloutPercent) {
      return res.status(503).json({ error: "FEATURE_DISABLED", message: "Profile-aware substitutions are not enabled for this account." });
    }

    const barcode = typeof req.body?.barcode === "string" ? req.body.barcode.trim() : "";
    const profileId = typeof req.body?.profileId === "string" ? req.body.profileId.trim() : "";
    const requestedLimit = req.body?.limit == null ? 5 : Number(req.body.limit);
    if (!/^\d{4,32}$/.test(barcode) || !/^[a-zA-Z0-9_-]{1,128}$/.test(profileId) || !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: `barcode, profileId and an integer limit from 1 to ${MAX_LIMIT} are required.` });
    }

    try {
      const token = String(req.get("authorization")).replace(/^Bearer\s+/i, "");
      const profile = await profiles.getOwnedProfile({ uid: req.auth.uid, profileId, idToken: token });
      if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND", message: "The selected profile was not found for this account." });
      const response = service.getSubstitutions({ barcode, profile, limit: requestedLimit, requestId });
      return res.status(200).json(response);
    } catch (error) {
      logger.error?.(JSON.stringify({ event: "substitution.failed", requestId, code: error.code || "UNEXPECTED_ERROR", message: error.message }));
      return res.status(error.code === "PROFILE_STORE_UNAVAILABLE" ? 503 : 500).json({
        error: error.code === "PROFILE_STORE_UNAVAILABLE" ? "PROFILE_STORE_UNAVAILABLE" : "SUBSTITUTION_ERROR",
        message: error.code === "PROFILE_STORE_UNAVAILABLE" ? "The selected profile could not be loaded safely." : "Substitutions could not be generated."
      });
    }
  });

  return router;
}

module.exports = { createSubstitutionRouter, rolloutBucket };
