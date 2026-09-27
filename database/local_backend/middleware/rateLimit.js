function createUserRateLimit(options = {}) {
  const windowMs = Math.max(1000, Number(options.windowMs) || 60_000);
  const maxRequests = Math.max(1, Number(options.maxRequests) || 30);
  const buckets = new Map();
  return function userRateLimit(req, res, next) {
    const key = req.auth?.uid;
    if (!key) return res.status(401).json({ error: "AUTH_REQUIRED", message: "Authentication is required." });
    const now = Date.now();
    const previous = buckets.get(key);
    const bucket = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + windowMs } : previous;
    bucket.count += 1;
    buckets.set(key, bucket);
    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(Math.max(0, maxRequests - bucket.count)));
    if (bucket.count > maxRequests) {
      res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: "RATE_LIMITED", message: "Too many substitution requests. Please try again shortly." });
    }
    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    return next();
  };
}

module.exports = { createUserRateLimit };
