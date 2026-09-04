jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
}));

import { conflictsWithRestrictions } from "@/app/api/7-day-meal-plan/+api";

describe("7-day meal plan allergen safety", () => {
  const seafoodProfile = {
    allergies: [" Seafood "],
    intolerances: [],
  };

  it.each([
    { allergens: ["soy"], traces: "May contain: shrimp" },
    { allergens: ["soy"], traces: "none declared", ingredientsText: "Allergy advice: may contain fish." },
    { allergens: ["SEA/FOOD"], traces: "none declared" },
  ])("rejects unsafe fish/seafood evidence: %p", (product) => {
    expect(
      conflictsWithRestrictions(
        seafoodProfile as any,
        { barcode: "unsafe", ...product } as any
      )
    ).toBe(true);
  });

  it("rejects incomplete allergen declarations instead of treating them as safe", () => {
    expect(
      conflictsWithRestrictions(
        seafoodProfile as any,
        { barcode: "unknown", allergens: ["soy"], traces: null } as any
      )
    ).toBe(true);
  });

  it("does not apply a user-specific conflict when no restrictions are supplied", () => {
    expect(
      conflictsWithRestrictions(
        { allergies: [], intolerances: [] } as any,
        { barcode: "unrestricted", allergens: ["SEA/FOOD"], traces: "none declared" } as any
      )
    ).toBe(false);
  });
});
