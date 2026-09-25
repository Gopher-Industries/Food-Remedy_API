export const UNKNOWN_ALLERGEN = "Unknown";

const MISSING_ALLERGEN_MARKERS = new Set([
  "",
  "[]",
  "n/a",
  "na",
  "none",
  "not available",
  "not provided",
  "null",
  "unknown",
]);

function knownAllergens(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return source
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => !MISSING_ALLERGEN_MARKERS.has(item.toLowerCase()));
}

/**
 * Keep known values and use the contract sentinel when allergen data is absent.
 * A known legacy `allergensDetected` fallback takes precedence over `Unknown`.
 */
export function normaliseAllergens(
  value: unknown,
  detectedFallback?: unknown,
): string[] {
  const known = knownAllergens(value);
  if (known.length) return known;

  const detected = knownAllergens(detectedFallback);
  return detected.length ? detected : [UNKNOWN_ALLERGEN];
}
