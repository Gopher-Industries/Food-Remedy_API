export const INCOMPLETE_ALLERGEN_DATA_REASON =
  "Allergen information is incomplete; safety is unknown.";

export type AllergenSafetyStatus = "safe" | "unsafe" | "unknown";

export interface AllergenSafetyAssessment {
  status: AllergenSafetyStatus;
  matchedAllergen?: string;
}

interface ProductAllergenFields {
  allergens?: unknown;
  traces?: unknown;
}

function readAllergens(value: unknown): {
  complete: boolean;
  values: string[];
} {
  if (!Array.isArray(value) || value.length === 0) {
    return { complete: false, values: [] };
  }

  const complete = value.every(
    (item) => typeof item === "string" && item.trim().length > 0
  );
  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLowerCase().trim())
    .filter(Boolean);

  return { complete, values };
}

function readTraces(value: unknown): {
  complete: boolean;
  values: string[];
} {
  if (typeof value !== "string" || !value.trim()) {
    return { complete: false, values: [] };
  }

  return {
    complete: true,
    values: value
      .split(/[;,]/)
      .map((item) => item.toLowerCase().trim())
      .filter(Boolean),
  };
}

function normaliseAllergies(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLowerCase().trim())
    .filter(Boolean);
}

/**
 * Applies the shared backend rule for untrusted allergen data.
 * A known match is unsafe. A non-match is only safe when both the allergen
 * list and trace string contain valid data; otherwise its safety is unknown.
 */
export function assessAllergenSafety(
  product: ProductAllergenFields,
  profileAllergies: unknown
): AllergenSafetyAssessment {
  const allergens = readAllergens(product.allergens);
  const traces = readTraces(product.traces);
  const allergies = normaliseAllergies(profileAllergies);
  const productValues = [...allergens.values, ...traces.values];

  const matchedAllergen = allergies.find((allergy) =>
    productValues.some(
      (value) => value.includes(allergy) || allergy.includes(value)
    )
  );

  if (matchedAllergen) {
    return { status: "unsafe", matchedAllergen };
  }

  if (!allergens.complete || !traces.complete) {
    return { status: "unknown" };
  }

  return { status: "safe" };
}
