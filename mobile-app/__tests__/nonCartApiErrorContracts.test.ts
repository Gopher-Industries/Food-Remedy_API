/* eslint-disable import/first -- route dependencies must be mocked before imports */
jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
}));

import { getDoc, getDocs } from "firebase/firestore";
import { POST as classifyProduct } from "../app/api/products/classify+api";
import { POST as generateMealPlan } from "../app/api/7-day-meal-plan/+api";

describe("release-critical non-cart API error contracts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a stable classification failure without provider details", async () => {
    (getDoc as jest.Mock).mockRejectedValue(
      new Error("provider response for person@example.com: Bearer private-token")
    );

    const response = await classifyProduct(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "classify_trace-123",
        },
        body: JSON.stringify({
          barcode: "1234567890123",
          profile: { allergies: ["peanuts"], dietaryPreferences: ["vegan"] },
        }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchInlineSnapshot(`
      {
        "error": "CLASSIFICATION_FAILED",
        "message": "Unable to classify product.",
        "requestId": "classify_trace-123",
      }
    `);
    expect(response.headers.get("x-request-id")).toBe("classify_trace-123");
  });

  it("returns a stable meal-plan failure without profile restrictions", async () => {
    (getDocs as jest.Mock).mockRejectedValue(
      new Error("USERS/firebase-user-123 provider body contains diabetes")
    );

    const response = await generateMealPlan(
      new Request("http://localhost/api/7-day-meal-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "mealplan_trace-123",
        },
        body: JSON.stringify({ allergies: ["peanuts"], intolerances: ["gluten"] }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchInlineSnapshot(`
      {
        "error": "MEAL_PLAN_FAILED",
        "message": "Unable to generate meal plan.",
        "requestId": "mealplan_trace-123",
      }
    `);
    expect(response.headers.get("x-request-id")).toBe("mealplan_trace-123");
  });
});
