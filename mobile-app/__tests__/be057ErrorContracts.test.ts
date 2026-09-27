jest.mock("@/config/firebaseConfig", () => ({
  fdb: {},
}));

jest.mock("firebase/firestore", () => ({
  addDoc: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(() => "mock-timestamp"),
}));

import { addDoc, collection, doc, getDoc, getDocs } from "firebase/firestore";
import { POST as classifyProduct } from "@/app/api/products/classify+api";
import { POST as createMealPlan } from "@/app/api/7-day-meal-plan/+api";
import submitFeedback from "@/services/database/feedback/submitFeedback";

const providerMessage =
  "FirebaseError: provider failed for secret.person@example.com uid=firebase-user-abc123 https://provider.example/raw body={\"secret\":true}";

describe("BE057 public error contracts", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (collection as jest.Mock).mockReturnValue({});
    (doc as jest.Mock).mockReturnValue({});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("keeps classify provider failures out of the response and logs", async () => {
    (getDoc as jest.Mock).mockRejectedValue(new Error(providerMessage));

    const response = await classifyProduct(
      new Request("http://localhost/api/products/classify", {
        method: "POST",
        body: JSON.stringify({ barcode: "123", profile: {} }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "SERVER_ERROR",
      message: "Unexpected error while classifying product.",
    });
    expect(JSON.stringify(body)).not.toContain("provider failed");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("secret.person@example.com");
  });

  it("keeps meal-plan provider failures out of the response", async () => {
    (getDocs as jest.Mock).mockRejectedValue(new Error(providerMessage));

    const response = await createMealPlan(
      new Request("http://localhost/api/7-day-meal-plan", {
        method: "POST",
        body: JSON.stringify({ productLimit: 1 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "SERVER_ERROR",
      message: "Unexpected error while generating 7-day meal plan.",
    });
    expect(JSON.stringify(body)).not.toContain("provider failed");
    expect(JSON.stringify(body)).not.toContain("secret.person@example.com");
  });

  it("keeps feedback service-result errors stable and public-safe", async () => {
    (addDoc as jest.Mock).mockRejectedValue(new Error(providerMessage));

    const result = await submitFeedback({
      message: "hello",
      email: "secret.person@example.com",
      uid: "firebase-user-abc123",
    });

    expect(result).toEqual({
      success: false,
      message: "Failed to submit feedback",
    });
    expect(JSON.stringify(result)).not.toContain("provider failed");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("secret.person@example.com");
  });
});
