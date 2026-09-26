import { POST as classifyProductApi } from "../app/api/products/classify+api";
import { doc, getDoc } from "firebase/firestore";

jest.mock("../config/firebaseConfig", () => ({ fdb: {} }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

const mockDoc = doc as jest.MockedFunction<typeof doc>;
const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;

type ClassifyResponse = {
  barcode?: string;
  colour?: "red" | "green" | "grey";
  score?: number;
  reasons?: string[];
  productName?: string;
  brand?: string;
  message?: string;
  error?: string;
};

async function classifyFromUi(
  body: unknown,
): Promise<{ status: number; body: ClassifyResponse }> {
  const request = new Request("http://localhost/api/products/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const response = await classifyProductApi(request);
  return { status: response.status, body: await response.json() };
}

function mockProductRead(product: unknown) {
  mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => product,
  } as Awaited<ReturnType<typeof getDoc>>);
}

describe("DB030 API + UI integration flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns RED classification from API and maps to UI badge state", async () => {
    mockProductRead({
      barcode: "12345",
      productName: "Milk Chocolate",
      allergens: ["milk"],
      nutrientLevels: { sugars: "high" },
    });

    const { status, body } = await classifyFromUi({
      barcode: "12345",
      profile: { allergies: ["milk"] },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      barcode: "12345",
      colour: "red",
      score: 0,
      productName: "Milk Chocolate",
    });
    expect(body.reasons).toContain("Contains allergens for this profile: milk");
  });

  it("returns 400 for invalid requests without reading Firestore", async () => {
    const { status, body } = await classifyFromUi({ barcode: "" });

    expect(status).toBe(400);
    expect(body).toEqual({
      error: "INVALID_REQUEST",
      message: "Missing or invalid 'barcode' in request body.",
    });
    expect(mockDoc).not.toHaveBeenCalled();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested Firestore product does not exist", async () => {
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => false,
    } as Awaited<ReturnType<typeof getDoc>>);

    const { status, body } = await classifyFromUi({ barcode: " missing-product " });

    expect(status).toBe(404);
    expect(body).toEqual({
      error: "PRODUCT_NOT_FOUND",
      message: "No product found for barcode missing-product.",
    });
    expect(mockDoc).toHaveBeenCalledWith({}, "PRODUCTS", "missing-product");
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it("returns the documented GREY fallback when nutrition data is absent", async () => {
    mockProductRead({
      allergens: ["none"],
      traces: "none",
      productName: "Nutrition Pending",
      brand: "Example Foods",
    });

    const { status, body } = await classifyFromUi({ barcode: "no-nutrition" });

    expect(status).toBe(200);
    expect(body).toEqual({
      barcode: "no-nutrition",
      colour: "grey",
      score: 50,
      reasons: ["Insufficient nutrition data; classified as GREY by default."],
      productName: "Nutrition Pending",
      brand: "Example Foods",
    });
  });

  it("treats malformed optional product fields as unavailable data instead of failing", async () => {
    mockProductRead({
      productName: "Partially Imported Product",
      allergens: "milk",
      nutrientLevels: null,
    });

    const { status, body } = await classifyFromUi({ barcode: "partial-product" });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      barcode: "partial-product",
      colour: "grey",
      score: 50,
      productName: "Partially Imported Product",
    });
    expect(body.reasons).toEqual([
      "Allergen information is incomplete; safety is unknown.",
      "Insufficient nutrition data; classified as GREY by default.",
    ]);
  });

  it("preserves the current nutritional score thresholds", async () => {
    mockProductRead({
      barcode: "green",
      allergens: ["none"],
      traces: "none",
      nutrientLevels: { fat: "high" },
    });
    const green = await classifyFromUi({ barcode: "green" });

    mockProductRead({
      barcode: "grey",
      allergens: ["none"],
      traces: "none",
      nutrientLevels: { fat: "high", salt: "high" },
    });
    const grey = await classifyFromUi({ barcode: "grey" });

    mockProductRead({
      barcode: "red",
      allergens: ["none"],
      traces: "none",
      nutrientLevels: {
        fat: "high",
        "saturated-fat": "high",
        salt: "high",
      },
    });
    const red = await classifyFromUi({ barcode: "red" });

    expect(green).toEqual({
      status: 200,
      body: {
        barcode: "green",
        colour: "green",
        score: 80,
        reasons: ["High fat"],
        productName: undefined,
        brand: undefined,
      },
    });
    expect(grey.body).toMatchObject({ colour: "grey", score: 60 });
    expect(grey.body.reasons).toEqual([
      "High fat",
      "High salt",
      "Moderate nutritional risk.",
    ]);
    expect(red.body).toMatchObject({ colour: "red", score: 35 });
    expect(red.body.reasons).toEqual([
      "High fat",
      "High saturated fat",
      "High salt",
      "High nutritional risk.",
    ]);
  });
});
