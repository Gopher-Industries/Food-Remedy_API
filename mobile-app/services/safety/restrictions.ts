export type SafetyProductRestrictions = {
  allergens?: unknown;
  traces?: unknown;
};
 
export type SafetyProfileRestrictions = {
  allergies?: unknown;
  intolerances?: unknown;
};
 
const SEAFOOD_TERMS = new Set([
  "seafood",
  "fish",
  "fishes",
  "shellfish",
  "crustacean",
  "crustaceans",
  "crustacea",
  "mollusc",
  "molluscs",
  "prawn",
  "prawns",
  "shrimp",
  "shrimps",
  "oyster",
  "oysters",
  "anchovy",
  "anchovies",
  "hoki",
]);
 
function normaliseRestriction(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^([a-z]{2,3}):/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
 
function toRestrictionList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;|]/)
      : [];
 
  return values
    .filter((item): item is string => typeof item === "string")
    .map(normaliseRestriction)
    .filter(Boolean);
}
 
function isSeafoodTerm(value: string): boolean {
  return Array.from(SEAFOOD_TERMS).some(
    (term) =>
      value === term ||
      value.includes(`${term} `) ||
      value.includes(` ${term}`)
  );
}
 
export function restrictionsMatch(
  restriction: string,
  productTerm: string
): boolean {
  const expected = normaliseRestriction(restriction);
  const actual = normaliseRestriction(productTerm);
 
  if (!expected || !actual) return false;
 
  if (isSeafoodTerm(expected) && isSeafoodTerm(actual)) {
    return true;
  }
 
  return actual.includes(expected) || expected.includes(actual);
}
 
export function findRestrictionConflict(
  profile: SafetyProfileRestrictions,
  product: SafetyProductRestrictions
): string | undefined {
  const restrictions = [
    ...toRestrictionList(profile.allergies),
    ...toRestrictionList(profile.intolerances),
  ];
 
  const declaredRisks = [
    ...toRestrictionList(product.allergens),
    ...toRestrictionList(product.traces),
  ];
 
  return restrictions.find((restriction) =>
    declaredRisks.some((risk) => restrictionsMatch(restriction, risk))
  );
}