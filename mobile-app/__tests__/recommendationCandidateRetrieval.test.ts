jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import type { Product } from "@/types/Product";
import { getCandidatesForRecommendations } from "@/services/database/products/getCandidatesForRecommendations";

const mockedCollection = collection as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedLimit = limit as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedWhere = where as jest.Mock;

function originalProduct(categories: unknown): Product {
  return {
    barcode: "original-barcode",
    categories,
  } as unknown as Product;
}

function candidateDoc(id: string, data: unknown) {
  return {
    id,
    data: () => data,
  };
}

function snapshot(...docs: ReturnType<typeof candidateDoc>[]) {
  return {
    forEach: (callback: (doc: ReturnType<typeof candidateDoc>) => void) => docs.forEach(callback),
  };
}

describe("getCandidatesForRecommendations", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedCollection.mockReturnValue({ path: "PRODUCTS" });
    mockedWhere.mockImplementation((...args: unknown[]) => ({ type: "where", args }));
    mockedLimit.mockImplementation((value: number) => ({ type: "limit", value }));
    mockedQuery.mockImplementation((...constraints: unknown[]) => ({ constraints }));
  });

  it.each([
    ["missing categories", undefined],
    ["empty categories", []],
    ["only broad categories", ["en:food", " groceries ", "meal"]],
    ["malformed category values", [null, 42, { category: "snacks" }, " en: "]],
  ])("returns no candidates and does not query for %s", async (_caseName, categories) => {
    await expect(getCandidatesForRecommendations(originalProduct(categories))).resolves.toEqual([]);

    expect(mockedCollection).not.toHaveBeenCalled();
    expect(mockedWhere).not.toHaveBeenCalled();
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it("normalizes specific source categories and applies the requested pool limit", async () => {
    mockedGetDocs.mockResolvedValue(snapshot());

    await expect(getCandidatesForRecommendations(
      originalProduct(["en:food", " snacks ", "en:breakfast-cereals", "en:oats"]),
      17
    )).resolves.toEqual([]);

    expect(mockedCollection).toHaveBeenCalledWith({}, "PRODUCTS");
    expect(mockedWhere).toHaveBeenCalledWith(
      "categories",
      "array-contains-any",
      ["breakfast-cereals", "oats"]
    );
    expect(mockedLimit).toHaveBeenCalledWith(17);
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);
  });

  it("returns an empty result when the category query has no matching documents", async () => {
    mockedGetDocs.mockResolvedValue(snapshot());

    await expect(getCandidatesForRecommendations(originalProduct(["snacks"]))).resolves.toEqual([]);
  });

  it("excludes the original product, removes duplicate barcodes, and gives document-id candidates a barcode", async () => {
    mockedGetDocs.mockResolvedValue(snapshot(
      candidateDoc("original-document", { barcode: "original-barcode", productName: "Original" }),
      candidateDoc("candidate-document", { barcode: "candidate-barcode", productName: "Candidate" }),
      candidateDoc("duplicate-document", { barcode: "candidate-barcode", productName: "Duplicate" }),
      candidateDoc("fallback-document", { productName: "Fallback candidate" }),
      candidateDoc("", { productName: "Invalid candidate" })
    ));

    const candidates = await getCandidatesForRecommendations(originalProduct(["snacks"]));

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.barcode)).toEqual([
      "candidate-barcode",
      "fallback-document",
    ]);
    expect(candidates.map((candidate) => candidate.productName)).toEqual([
      "Candidate",
      "Fallback candidate",
    ]);
  });

  it("normalizes retrieved candidates that are missing optional product fields", async () => {
    mockedGetDocs.mockResolvedValue(snapshot(
      candidateDoc("partial-document", { categories: ["snacks"] })
    ));

    const [candidate] = await getCandidatesForRecommendations(originalProduct(["snacks"]));

    expect(candidate).toEqual(expect.objectContaining({
      id: "partial-document",
      barcode: "partial-document",
      productName: "",
      brand: null,
      genericName: null,
      categories: ["snacks"],
      additives: [],
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
    }));
  });

  it("propagates Firestore query failures to the recommendation service error boundary", async () => {
    const failure = new Error("Firestore query unavailable");
    mockedGetDocs.mockRejectedValue(failure);

    await expect(getCandidatesForRecommendations(originalProduct(["snacks"]))).rejects.toBe(failure);
  });
});
