import { findRestrictionRule } from "@/services/constants/AllergenTaxonomy";

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

function normalizeEvidence(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^([a-z]{2,3}):/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeRawEvidence(raw: string[]): string[] {
  return raw
    .flatMap((item) => item.split(/[;,]/))
    .map(normalizeEvidence)
    .filter(Boolean);
}

function readArrayEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizeRawEvidence(
    value.filter((item): item is string => typeof item === "string")
  );
}

function readStringEvidence(value: unknown): string[] {
  return typeof value === "string" ? normalizeRawEvidence([value]) : [];
}

function isCompleteAllergenList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === "string" && item.trim().length > 0
    )
  );
}

function isCompleteTraceDeclaration(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRestrictions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function containsAlias(evidence: string, alias: string): boolean {
  const normalizedAlias = normalizeEvidence(alias);
  if (!normalizedAlias) return false;
  return (`-${evidence}-`).includes(`-${normalizedAlias}-`);
}

function productEvidence(product: ProductAllergenFields): string[] {
  return Array.from(
    new Set([
      ...readArrayEvidence(product.allergens),
      ...readStringEvidence(product.traces),
      ...readStringEvidence(product.tracesFromIngredients),
      ...readArrayEvidence(product.ingredients),
      ...readStringEvidence(product.ingredientsText),
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
