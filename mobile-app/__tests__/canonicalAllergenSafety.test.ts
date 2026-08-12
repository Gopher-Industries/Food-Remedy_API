import {
  ALLERGIES,
  INTOLERANCES,
} from "@/services/constants/NutritionalTags";
import { findRestrictionRule } from "@/services/constants/AllergenTaxonomy";
import {
  assessAllergenSafety,
  findRestrictionMatches,
} from "@/services/allergenSafety";
import { normaliseRetrictionsForProfileCheck } from "@/services/utils/normaliseRestrictionsForProfileCheck";
import allergenConfig from "../../database/Allergens/allergens_config.json";

describe("canonical allergen safety", () => {
  const completeDeclaration = {
    allergens: ["sesame"],
    traces: "sulphites",
  };

  it.each([
    ["Fish", { allergens: ["Fish"] }],
    ["Crustacea", { allergens: ["Crustacea"] }],
    ["Molluscs", { allergens: ["Molluscs"] }],
    ["tuna", { ingredients: ["en:tuna"] }],
    ["salmon", { ingredientsText: "Salmon, olive oil, salt" }],
    ["prawns", { traces: "PRAWNS" }],
    ["crab", { tracesFromIngredients: "May contain crab" }],
    ["oysters", { ingredients: ["oysters"] }],
    ["squid", { ingredientsText: "squid; water" }],
  ])("maps Seafood to %s evidence", (_name, evidence) => {
    expect(
      assessAllergenSafety(
        { ...completeDeclaration, ...evidence },
        ["Seafood"]
      )
    ).toEqual(
      expect.objectContaining({
        status: "unsafe",
        matchedAllergen: "Seafood",
      })
    );
  });

  const selectableAllergyFixtures: Array<[string, Record<string, unknown>]> = [
    ["Egg", { allergens: ["eggs"] }],
    ["Soy", { allergens: ["en:soybeans"] }],
    ["Garlic", { ingredients: ["garlic powder"] }],
    ["Mustard", { tracesFromIngredients: "mustard seed" }],
    ["Seafood", { allergens: ["Fish"] }],
    ["Tree Nuts", { traces: "almonds" }],
    ["Peanuts", { allergens: ["groundnuts"] }],
  ];

  it("has a positive-match fixture for every selectable profile allergy", () => {
    expect(selectableAllergyFixtures.map(([restriction]) => restriction)).toEqual(
      ALLERGIES
    );
  });

  it("defines behavior for every selectable allergy and intolerance", () => {
    for (const restriction of [...ALLERGIES, ...INTOLERANCES]) {
      expect(findRestrictionRule(restriction)).toBeDefined();
    }
  });

  it.each(selectableAllergyFixtures)(
    "detects the selectable %s restriction",
    (restriction, evidence) => {
      expect(
        assessAllergenSafety(
          { ...completeDeclaration, ...evidence },
          [restriction]
        ).status
      ).toBe("unsafe");
    }
  );

  it.each([
    ["Gluten", { allergens: ["wheat"] }],
    ["Lactose", { allergens: ["milk"] }],
    ["Caffeine", { ingredients: ["caffeine"] }],
  ])("detects the supported %s intolerance", (restriction, evidence) => {
    expect(
      assessAllergenSafety(
        { ...completeDeclaration, ...evidence },
        [restriction]
      ).status
    ).toBe("unsafe");
  });

  it.each(["Garlic", "Lactose", "Caffeine", "Histamine"])(
    "does not claim safe for ingredient-dependent or unsupported %s",
    (restriction) => {
      expect(
        assessAllergenSafety(completeDeclaration, [restriction]).status
      ).toBe("unknown");
    }
  );

  it("keeps Peanuts distinct from Tree Nuts", () => {
    expect(findRestrictionMatches({ allergens: ["peanuts"] }, ["Tree Nuts"]))
      .toEqual([]);
    expect(findRestrictionMatches({ allergens: ["walnuts"] }, ["Peanuts"]))
      .toEqual([]);
  });

  it("normalizes case, whitespace, language prefixes, singulars and plurals", () => {
    expect(
      findRestrictionMatches(
        { allergens: ["  EN:Fish  "], traces: "PRAWNS; oyster" },
        [" seafood "]
      )
    ).toEqual(["seafood"]);
  });

  it("uses the canonical matcher in the legacy restriction normalizer", () => {
    expect(
      normaliseRetrictionsForProfileCheck({
        allergens: ["Fish"],
        traces: ["may contain oyster"],
        additives: [],
      }).allergens
    ).toContain("Seafood");
  });

  it.each([
    ["Egg", ["Egg"]],
    ["Soy", ["Soy"]],
    ["Mustard", ["Mustard"]],
    ["Seafood", ["Fish", "Crustacea", "Molluscs"]],
    ["Tree Nuts", ["Tree Nuts"]],
    ["Peanuts", ["Peanuts"]],
    ["Gluten", ["Gluten"]],
  ])(
    "stays aligned with enrichment keywords for %s",
    (restriction, backendNames) => {
      const entries = allergenConfig.allergens.filter((entry) =>
        backendNames.includes(entry.name)
      );

      for (const entry of entries) {
        for (const keyword of entry.keywords) {
          expect(
            findRestrictionMatches({ ingredients: [keyword] }, [restriction])
          ).toContain(restriction);
        }
      }
    }
  );
});
