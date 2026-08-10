import { conflictsWithRestrictions } from "@/app/api/7-day-meal-plan/+api";
import { classifyProduct } from "@/app/api/products/classify+api";
import { getAlternatives, isUnsuitableForProfile } from "@/services/recommendations";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
}));

jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

const mealProfile = {
  id: "profile-1",
  name: "Safety fixture",
  dietType: "omnivore" as const,
  allergies: ["Seafood"],
  intolerances: [],
  dietaryPreferences: [],
  preferredCategories: [],
};

const backendProfile = {
  allergies: mealProfile.allergies,
  intolerances: mealProfile.intolerances,
};

const traceFishFixture = {
  barcode: "unsafe-trace-fish",
  productName: "Trace fish fixture",
  allergens: [],
  traces: "en:fish, en:milk",
};

describe("meal-plan safety parity", () => {
  it("blocks the same fish trace fixture in every backend safety path", () => {
    expect(conflictsWithRestrictions(mealProfile, traceFishFixture)).toBe(true);

    expect(classifyProduct(traceFishFixture, backendProfile)).toMatchObject({
      colour: "red",
      score: 0,
    });

    expect(
      isUnsuitableForProfile(
        traceFishFixture as unknown as Product,
        backendProfile as unknown as NutritionalProfile
      )
    ).toMatchObject({ unsuitable: true });

    const recommendationProduct = {
      ...traceFishFixture,
      categories: ["ready meals"],
      additives: [],
      labels: [],
      nutrientLevels: {},
      nutriscoreGrade: "A",
    } as unknown as Product;
    expect(
      getAlternatives(
        { ...recommendationProduct, barcode: "original" },
        [recommendationProduct],
        backendProfile as unknown as NutritionalProfile
      )
    ).toEqual([]);
  });

  it.each([
    {
      label: "bidirectional allergen substring",
      allergies: ["peanut"],
      intolerances: [],
      product: { allergens: ["en:peanuts"], traces: "" },
    },
    {
      label: "intolerance in a trace declaration",
      allergies: [],
      intolerances: ["lactose"],
      product: { allergens: [], traces: "may contain lactose" },
    },
    {
      label: "fish and seafood alias",
      allergies: ["fish"],
      intolerances: [],
      product: { allergens: ["seafood"], traces: "" },
    },
  ])("conservatively blocks $label", ({ allergies, intolerances, product }) => {
    expect(
      conflictsWithRestrictions(
        { ...mealProfile, allergies, intolerances },
        { barcode: "unsafe", ...product }
      )
    ).toBe(true);
  });

  it("does not block an unrelated restriction", () => {
    expect(
      conflictsWithRestrictions(mealProfile, {
        barcode: "safe",
        allergens: ["peanuts"],
        traces: "milk",
      })
    ).toBe(false);
  });
});
