jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CACHE_TTL,
  cacheEntity,
  clearEntityCache,
  getCachedEntity,
  isCacheFresh,
  removeCachedEntity,
  cleanupCache,
} from "@/services/cache/productCache";

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("product cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue();
    mockedStorage.removeItem.mockResolvedValue();
  });

  it("stores a successful API response in cache", async () => {
    const product = { barcode: "123", productName: "Test", brand: null, genericName: null, ingredientsText: null, ingredientsAnalysis: null, additives: [], allergens: [], categories: [], labels: [], ingredients: [], traces: null, tracesFromIngredients: null, nutriments: {}, nutrientLevels: { fat: "unknown", salt: "unknown", sugars: "unknown", "saturated-fat": "unknown" }, nutriscoreGrade: "UNKNOWN", productQuantity: null, productQuantityUnit: null, servingQuantity: null, servingQuantityUnit: null, completeness: 0, images: { root: "", primary: null, variants: {} } } as any;

    const entry = await cacheEntity(product);

    expect(entry).not.toBeNull();
    expect(mockedStorage.setItem).toHaveBeenCalled();
    expect(JSON.parse(String(mockedStorage.setItem.mock.calls[0][1]))[0].id).toBe("123");
  });

  it("retrieves a cached entity", async () => {
    const product = { barcode: "321", productName: "Cached", brand: null, genericName: null, ingredientsText: null, ingredientsAnalysis: null, additives: [], allergens: [], categories: [], labels: [], ingredients: [], traces: null, tracesFromIngredients: null, nutriments: {}, nutrientLevels: { fat: "unknown", salt: "unknown", sugars: "unknown", "saturated-fat": "unknown" }, nutriscoreGrade: "UNKNOWN", productQuantity: null, productQuantityUnit: null, servingQuantity: null, servingQuantityUnit: null, completeness: 0, images: { root: "", primary: null, variants: {} } } as any;

    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify([{ id: "321", data: product, cachedAt: Date.now(), lastAccessedAt: Date.now(), version: 1 }]));

    const cached = await getCachedEntity("321");

    expect(cached?.data.productName).toBe("Cached");
  });

  it("treats stale cache as stale when expired", async () => {
    const staleEntry = { id: "abc", data: {} as any, cachedAt: Date.now() - CACHE_TTL - 1000, lastAccessedAt: Date.now(), version: 1 };

    expect(isCacheFresh(staleEntry)).toBe(false);
  });

  it("removes a cached entity after delete request", async () => {
    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify([{ id: "delete-me", data: { barcode: "delete-me" }, cachedAt: Date.now(), lastAccessedAt: Date.now(), version: 1 }]));

    await removeCachedEntity("delete-me");

    expect(mockedStorage.setItem).toHaveBeenCalled();
  });

  it("cleans up expired entries", async () => {
    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify([
      { id: "keep", data: { barcode: "keep" }, cachedAt: Date.now(), lastAccessedAt: Date.now(), version: 1 },
      { id: "old", data: { barcode: "old" }, cachedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, lastAccessedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, version: 1 },
    ]));

    await cleanupCache();

    expect(mockedStorage.setItem).toHaveBeenCalled();
  });

  it("clearEntityCache empties the storage key", async () => {
    await clearEntityCache();

    expect(mockedStorage.removeItem).toHaveBeenCalledWith("product-cache-v1");
  });
});
