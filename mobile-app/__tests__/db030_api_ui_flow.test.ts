import { POST as classifyProductApi } from "../app/api/products/classify+api";
import { doc, getDoc } from "firebase/firestore";

jest.mock("../config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

type ClassifyResponse = {
  colour?: "red" | "green" | "grey";
  reasons?: string[];
  message?: string;
  error?: string;
};

async function scanUiClassifyFlow(
  barcode: unknown,
  profile: Record<string, unknown>
) {
  const req = new Request("http://localhost/api/products/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ barcode, profile }),
  });

  const res = await classifyProductApi(req);
  const body = (await res.json()) as ClassifyResponse;

  // Simulates frontend state mapping from API payload.
  return {
    status: res.status,
    badgeColour: body.colour ?? "grey",
    reasonsCount: Array.isArray(body.reasons) ? body.reasons.length : 0,
    errorCode: body.error ?? null,
  };
}

describe("DB030 API + UI integration flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns RED classification from API and maps to UI badge state", async () => {
    (doc as jest.Mock).mockReturnValue({});
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        barcode: "12345",
        productName: "Milk Chocolate",
        allergens: ["milk"],
        nutrientLevels: { sugars: "high" },
      }),
    });

    const uiState = await scanUiClassifyFlow("12345", {
      allergies: ["milk"],
      dietaryPreferences: ["vegan"],
    });

    expect(uiState.status).toBe(200);
    expect(uiState.badgeColour).toBe("red");
    expect(uiState.reasonsCount).toBeGreaterThan(0);
  });

  it("returns 400 for invalid request and exposes UI-friendly error state", async () => {
    const uiState = await scanUiClassifyFlow("", {
      allergies: ["milk"],
    });

    expect(uiState.status).toBe(400);
    expect(uiState.badgeColour).toBe("grey");
    expect(uiState.errorCode).toBe("INVALID_REQUEST");
  });
});
