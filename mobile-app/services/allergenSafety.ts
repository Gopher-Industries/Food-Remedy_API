import {
  findRestrictionRule,
  normalizeSafetyText,
} from "@/services/constants/AllergenTaxonomy";

export const INCOMPLETE_ALLERGEN_DATA_REASON =
  "Allergen information is incomplete; safety is unknown.";

export type AllergenSafetyStatus = "safe" | "unsafe" | "unknown";

export interface AllergenSafetyAssessment {
  status: AllergenSafetyStatus;
  matchedAllergen?: string;
  matchedAllergens?: string[];
}

export interface ProductAllergenFields {
  allergens?: unknown;
  traces?: unknown;
  tracesFromIngredients?: unknown;
  ingredients?: unknown;
  ingredientsText?: unknown;
}

function normalizeRawEvidence(raw: string[]): string[] {
  return raw
    .flatMap((item) => item.split(/[;,|\n]+/))
    .map(normalizeSafetyText)
    .filter(Boolean);
}

function readEvidence(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeRawEvidence(
      value.filter((item): item is string => typeof item === "string")
    );
  }
  return typeof value === "string" ? normalizeRawEvidence([value]) : [];
}

function readArrayEvidence(value: unknown): string[] {
  return Array.isArray(value) ? readEvidence(value) : [];
}

const UNKNOWN_DECLARATION_VALUES = new Set([
  "unknown",
  "n-a",
  "na",
  "not-available",
  "not-provided",
  "not-specified",
  "not-declared",
  "not-applicable",
  "unspecified",
  "unavailable",
  "missing",
  "no-data",
  "no-information",
  "no-known-allergens",
  "no-known-traces",
]);

const UNRESOLVED_TRACE_DECLARATIONS = new Set([
  "may-contain",
  "may-contain-traces",
  "could-contain",
  "could-contain-traces",
  "contains-unknown-allergens",
  "allergens-unknown",
]);

function hasUnknownDeclaration(values: string[]): boolean {
  return values.some(
    (value) =>
      UNKNOWN_DECLARATION_VALUES.has(value) ||
      UNRESOLVED_TRACE_DECLARATIONS.has(value)
  );
}

function isCompleteAllergenList(value: unknown): boolean {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    return false;
  }

  const values = normalizeRawEvidence(value as string[]);
  return values.length > 0 && !hasUnknownDeclaration(values);
}

function isCompleteTraceDeclaration(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const values = normalizeRawEvidence([value]);
  return values.length > 0 && !hasUnknownDeclaration(values);
}

function normalizeRestrictions(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,|]+/)
      : [];

  return Array.from(
    new Set(
      raw
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function containsAlias(evidence: string, alias: string): boolean {
  const normalizedAlias = normalizeSafetyText(alias);
  if (!normalizedAlias) return false;
  return (`-${evidence}-`).includes(`-${normalizedAlias}-`);
}

function productEvidence(product: ProductAllergenFields): string[] {
  return Array.from(
    new Set([
      // The contract requires allergens to be an array. A scalar allergen
      // value is malformed and remains unknown rather than becoming trusted
      // evidence by accident.
      ...readArrayEvidence(product.allergens),
      ...readEvidence(product.traces),
      ...readEvidence(product.tracesFromIngredients),
      ...readEvidence(product.ingredients),
      ...readEvidence(product.ingredientsText),
    ])
  );
}

export function findRestrictionMatches(
  product: ProductAllergenFields,
  profileRestrictions: unknown
): string[] {
  const evidence = productEvidence(product);

  return normalizeRestrictions(profileRestrictions).filter((restriction) => {
    const rule = findRestrictionRule(restriction);
    if (!rule) return false;
    return rule.aliases.some((alias) =>
      evidence.some((item) => containsAlias(item, alias))
    );
  });
}

/**
 * Shared allergen/restriction decision used by backend and active scan flows.
 * Known evidence wins over incomplete fields. A safe result requires complete
 * allergen/trace declarations and only declaration-resolvable restrictions.
 */
export function assessAllergenSafety(
  product: ProductAllergenFields,
  profileRestrictions: unknown
): AllergenSafetyAssessment {
  const restrictions = normalizeRestrictions(profileRestrictions);
  const matchedAllergens = findRestrictionMatches(product, restrictions);

  if (matchedAllergens.length > 0) {
    return {
      status: "unsafe",
      matchedAllergen: matchedAllergens[0],
      matchedAllergens,
    };
  }

  const hasUnsupportedOrPositiveOnlyRestriction = restrictions.some(
    (restriction) => findRestrictionRule(restriction)?.resolution !== "declaration"
  );
  const declarationsComplete =
    isCompleteAllergenList(product.allergens) &&
    isCompleteTraceDeclaration(product.traces);

  if (!declarationsComplete || hasUnsupportedOrPositiveOnlyRestriction) {
    return { status: "unknown" };
  }

  return { status: "safe" };
}
