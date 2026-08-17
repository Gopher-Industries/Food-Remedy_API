export interface IncompleteAllergenFixture {
  name: string;
  fields: {
    allergens?: unknown;
    traces?: unknown;
  };
}

/**
 * Raw product field shapes that cannot support an explicit allergen-safe result.
 * These intentionally bypass the strict UI Product type because backend data is
 * untrusted at the safety boundary.
 */
export const incompleteAllergenDataFixtures: IncompleteAllergenFixture[] = [
  {
    name: "missing allergens",
    fields: { traces: "sesame" },
  },
  {
    name: "null allergens",
    fields: { allergens: null, traces: "sesame" },
  },
  {
    name: "empty allergens",
    fields: { allergens: [], traces: "sesame" },
  },
  {
    name: "malformed allergens",
    fields: { allergens: "milk", traces: "sesame" },
  },
  {
    name: "missing traces",
    fields: { allergens: ["soy"] },
  },
  {
    name: "null traces",
    fields: { allergens: ["soy"], traces: null },
  },
  {
    name: "empty traces",
    fields: { allergens: ["soy"], traces: "" },
  },
  {
    name: "malformed traces",
    fields: { allergens: ["soy"], traces: ["sesame"] },
  },
];
