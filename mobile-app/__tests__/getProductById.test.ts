jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

import { doc, getDoc } from "firebase/firestore";
import getProductById from "../services/database/products/getProductById";

describe("getProductById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue({ path: "PRODUCTS/partial" });
  });

  it("returns null when the Firestore product does not exist", async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await expect(getProductById("missing")).resolves.toBeNull();
    expect(doc).toHaveBeenCalledWith({}, "PRODUCTS", "missing");
  });

  it("returns a normalized product when optional fields are missing", async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      id: "partial",
      exists: () => true,
      data: () => ({ productName: "Partial Product" }),
    });

    const product = await getProductById("partial");

    expect(product).toEqual(
      expect.objectContaining({
        id: "partial",
        barcode: "partial",
        productName: "Partial Product",
        brand: null,
        genericName: null,
        allergens: ["Unknown"],
        ingredients: [],
        nutrientLevels: {
          fat: "unknown",
          salt: "unknown",
          sugars: "unknown",
          "saturated-fat": "unknown",
        },
        nutriments: {},
        nutriments_normalized: {},
        completeness: 0,
      })
    );
  });

  it("returns null when the Firestore read fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    (getDoc as jest.Mock).mockRejectedValue(new Error("Firestore unavailable"));

    try {
      await expect(getProductById("unavailable")).resolves.toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});
