import {
  findRestrictionMatches,
} from "@/services/allergenSafety";

export type SafetyProductRestrictions = {
  allergens?: unknown;
  traces?: unknown;
};
 
export type SafetyProfileRestrictions = {
  allergies?: unknown;
  intolerances?: unknown;
};
 
function toRestrictionList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
 
  return values
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(/[;,|]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function restrictionsMatch(
  restriction: string,
  productTerm: string
): boolean {
  return findRestrictionMatches(
    { allergens: [productTerm] },
    [restriction]
  ).length > 0;
}
 
export function findRestrictionConflict(
  profile: SafetyProfileRestrictions,
  product: SafetyProductRestrictions
): string | undefined {
  const restrictions = [
    ...toRestrictionList(profile.allergies),
    ...toRestrictionList(profile.intolerances),
  ];
 
  return findRestrictionMatches(
    { allergens: product.allergens, traces: product.traces },
    restrictions
  )[0];
}
