import {
  retrieveCandidatePool,
} from "@/services/database/products/getCandidatesForRecommendations";
import type { Product } from "@/types/Product";
import { getDocs } from "firebase/firestore";

jest.mock("@/config/firebaseConfig", () => ({
  fdb: {},
}));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => "PRODUCTS"),
  query: jest.fn((...args) => args),
  where: jest.fn((...args) => args),
  limit: jest.fn((value) => value),
  getDocs: jest.fn(),
}));

const mockedGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;

function product(
  barcode: string,
  categories: string[],
  productName = `Product ${barcode}`
): Product {
  return {
    barcode,
    productName,
    genericName: null,
    brand: "Test Brand",
    category: categories[0] ?? null,
    ingredientsText: null,
    ingredientsAnalysis: null,
    additives: [],
    allergens: [],
    categories,
    labels: [],
    ingredients: [],
    traces: null,
    tracesFromIngredients: null,
    nutrients: {},
    nutrients_normalized: {},
    nutrientLevels: {},
    nutriscoreGrade: "UNKNOWN",
    productQuantity: null,
    productQuantityUnit: null,
    servingQuantity: null,
    servingQuantityUnit: null,
    images: {
      root: "",
      primary: null,
      variants: {},
    },
    } as unknown as Product;
}

function mockSnapshot(records: Product[]) {
  mockedGetDocs.mockResolvedValue({
    forEach: (callback: (doc: any) => void) => {
      records.forEach((record, index) => {
        callback({
          id: record.barcode || `doc-${index}`,
          data: () => record,
        });
      });
    },
  } as any);
}

describe("BE035 candidate retrieval", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns candidates from the same specific category", async () => {
    const original = product("100", [
      "en:foods",
      "en:breakfast-cereals",
      "en:granolas",
    ]);

    mockSnapshot([
      product("101", ["breakfast-cereals", "granolas"]),
      product("102", ["breakfast-cereals", "granolas"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates.map((p) => p.barcode)).toEqual([
      "101",
      "102",
    ]);

    expect(result.metadata.noCandidateReason).toBeUndefined();
  });

  test("normalizes category tags before retrieval", async () => {
    const original = product("100", [
      " EN:FOODS ",
      " EN:BREAKFAST-CEREALS ",
      " EN:GRANOLAS ",
    ]);

    mockSnapshot([
      product("101", ["breakfast-cereals", "granolas"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.metadata.queryCategories).toContain("granolas");
    expect(result.metadata.queryCategories).toContain(
      "breakfast-cereals"
    );
  });

  test("ignores broad categories when selecting substitution categories", async () => {
    const original = product("100", [
      "food",
      "products",
      "groceries",
      "en:yogurts",
    ]);

    mockSnapshot([
      product("101", ["yogurts"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.metadata.queryCategories).toEqual(["yogurts"]);
  });

  test("returns an explicit reason when category data is missing", async () => {
    const original = product("100", []);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates).toEqual([]);
    expect(result.metadata.noCandidateReason).toBeTruthy();
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  test("returns an explicit reason when only broad categories exist", async () => {
    const original = product("100", [
      "food",
      "products",
      "groceries",
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates).toEqual([]);
    expect(result.metadata.noCandidateReason).toBeTruthy();
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  test("excludes the scanned product barcode", async () => {
    const original = product("100", ["yogurts"]);

    mockSnapshot([
      product("100", ["yogurts"]),
      product("101", ["yogurts"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(
      result.candidates.some((p) => p.barcode === "100")
    ).toBe(false);

    expect(
      result.candidates.some((p) => p.barcode === "101")
    ).toBe(true);
  });

  test("removes duplicate candidate barcodes", async () => {
    const original = product("100", ["yogurts"]);

    mockSnapshot([
      product("101", ["yogurts"]),
      product("101", ["yogurts"]),
      product("102", ["yogurts"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates.map((p) => p.barcode)).toEqual([
      "101",
      "102",
    ]);
  });

  test("excludes invalid product records without a usable barcode", async () => {
    const original = product("100", ["yogurts"]);

    const invalid = product("", ["yogurts"]);

    mockedGetDocs.mockResolvedValue({
      forEach: (callback: (doc: any) => void) => {
        callback({
          id: "",
          data: () => invalid,
        });

        callback({
          id: "101",
          data: () => product("101", ["yogurts"]),
        });
      },
    } as any);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates.map((p) => p.barcode)).toEqual([
      "101",
    ]);
  });

  test("bounds the returned candidate pool", async () => {
    const original = product("100", ["yogurts"]);

    const candidates = Array.from({ length: 50 }, (_, index) =>
      product(String(index + 200), ["yogurts"])
    );

    mockSnapshot(candidates);

    const result = await retrieveCandidatePool(original, 10);

    expect(result.candidates).toHaveLength(10);
    expect(result.metadata.candidatesReturned).toBe(10);
  });

  test("returns candidates in deterministic barcode order", async () => {
    const original = product("100", ["yogurts"]);

    mockSnapshot([
      product("300", ["yogurts"]),
      product("101", ["yogurts"]),
      product("205", ["yogurts"]),
    ]);

    const first = await retrieveCandidatePool(original);

    mockSnapshot([
      product("205", ["yogurts"]),
      product("300", ["yogurts"]),
      product("101", ["yogurts"]),
    ]);

    const second = await retrieveCandidatePool(original);

    expect(first.candidates.map((p) => p.barcode)).toEqual([
      "101",
      "205",
      "300",
    ]);

    expect(second.candidates.map((p) => p.barcode)).toEqual([
      "101",
      "205",
      "300",
    ]);
  });

  test("records candidate source metadata", async () => {
    const original = product("100", ["yogurts"]);

    mockSnapshot([
      product("101", ["yogurts"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.metadata.source).toBeTruthy();
    expect(result.metadata.queryCategories).toEqual(["yogurts"]);
    expect(result.metadata.candidatesReturned).toBe(1);
  });

  test("non-chocolate scans do not produce chocolate-only candidates", async () => {
    const original = product("100", [
      "en:breakfast-cereals",
      "en:granolas",
    ]);

    mockSnapshot([
      product("101", ["breakfast-cereals", "granolas"]),
      product("102", ["breakfast-cereals", "granolas"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates).toHaveLength(2);

    for (const candidate of result.candidates) {
      expect(candidate.categories).not.toContain("chocolate");
      expect(candidate.categories).not.toContain("chocolates");
    }
  });

  test("filters an unrelated document returned by the query", async () => {
    const original = product("100", ["en:breakfast-cereals", "en:granolas"]);
    mockSnapshot([
      product("101", ["chocolate"]),
      product("102", ["granolas"]),
    ]);

    const result = await retrieveCandidatePool(original);

    expect(result.candidates.map((candidate) => candidate.barcode)).toEqual(["102"]);
    expect(result.metadata.documentsRead).toBe(2);
    expect(result.metadata.excludedIrrelevant).toBe(1);
  });
});
