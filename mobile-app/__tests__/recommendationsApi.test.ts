import { getRecommendations } from "@/services/api/recommendations";
import { apiPost } from "@/services/apiClient";
import { getProductById } from "@/services/api/products";
import { getCandidatesForRecommendations } from "@/services/database/products/getCandidatesForRecommendations";
import { getAlternatives } from "@/services/recommendations";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";

jest.mock("@/services/apiClient", () => ({ apiPost: jest.fn() }));
jest.mock("@/services/api/products", () => ({ getProductById: jest.fn() }));
jest.mock("@/services/database/products/getCandidatesForRecommendations", () => ({
  getCandidatesForRecommendations: jest.fn(),
}));
jest.mock("@/services/recommendations", () => ({
  getAlternatives: jest.fn(),
  isUnsuitableForProfile: jest.fn(),
}));

const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockGetProduct = getProductById as jest.MockedFunction<typeof getProductById>;
const mockGetCandidates = getCandidatesForRecommendations as jest.MockedFunction<
  typeof getCandidatesForRecommendations
>;
const mockGetAlternatives = getAlternatives as jest.MockedFunction<typeof getAlternatives>;

const profile = { profileId: "profile-1" } as NutritionalProfile;
const original = { barcode: "original", categories: ["snacks"] } as Product;
const candidates = [{ barcode: "candidate" }] as Product[];
const recommendations = [{ score: 80 }] as ReturnType<typeof getAlternatives>;

describe("recommendation API source routing", () => {
  const originalSource = process.env.EXPO_PUBLIC_API_SOURCE;
  const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    delete process.env.EXPO_PUBLIC_API_SOURCE;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    mockGetProduct.mockResolvedValue(original);
    mockGetCandidates.mockResolvedValue(candidates);
    mockGetAlternatives.mockReturnValue(recommendations);
  });

  afterAll(() => {
    if (originalSource === undefined) delete process.env.EXPO_PUBLIC_API_SOURCE;
    else process.env.EXPO_PUBLIC_API_SOURCE = originalSource;
    if (originalBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("uses Firestore when the source is firestore", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "firestore";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://ignored.example";

    await expect(getRecommendations("original", profile, 3)).resolves.toBe(recommendations);
    expect(mockGetProduct).toHaveBeenCalledWith("original");
    expect(mockGetCandidates).toHaveBeenCalledWith(original, 200);
    expect(mockGetAlternatives).toHaveBeenCalledWith(original, candidates, profile, 3);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("uses the HTTP API when the source is api and the base URL exists", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "api";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example";
    mockApiPost.mockResolvedValue(recommendations);

    await expect(getRecommendations("original", profile, 4)).resolves.toBe(recommendations);
    expect(mockApiPost).toHaveBeenCalledWith("/recommendations", {
      barcode: "original",
      profile,
      limit: 4,
    });
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  it("uses the HTTP API in auto mode when the base URL exists", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "auto";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example";
    mockApiPost.mockResolvedValue(recommendations);

    await expect(getRecommendations("original", profile)).resolves.toBe(recommendations);
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  it("falls back to Firestore in auto mode when the API base URL is missing", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "auto";

    await expect(getRecommendations("original", profile)).resolves.toBe(recommendations);
    expect(mockGetProduct).toHaveBeenCalledWith("original");
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("also defaults missing source configuration to the Firestore fallback", async () => {
    await expect(getRecommendations("original", profile)).resolves.toBe(recommendations);
    expect(mockGetProduct).toHaveBeenCalledWith("original");
  });

  it("treats a blank source value as incomplete auto configuration", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "   ";

    await expect(getRecommendations("original", profile)).resolves.toBe(recommendations);
    expect(mockGetProduct).toHaveBeenCalledWith("original");
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("fails clearly when api mode has no base URL", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "api";

    await expect(getRecommendations("original", profile)).rejects.toMatchObject({
      code: "RECOMMENDATION_API_NOT_CONFIGURED",
      message: expect.stringContaining("EXPO_PUBLIC_API_BASE_URL"),
    });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  it("fails clearly for an unsupported source value", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "sqlite";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example";

    await expect(getRecommendations("original", profile)).rejects.toMatchObject({
      code: "UNSUPPORTED_RECOMMENDATION_SOURCE",
      message: "Unsupported recommendation source: sqlite",
    });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  it("surfaces normalized API timeout and error outcomes without silently falling back", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "api";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example";
    mockApiPost.mockRejectedValue(new Error("Request timed out"));

    await expect(getRecommendations("original", profile)).rejects.toMatchObject({
      message: "Request timed out",
    });
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  it("falls back to Firestore when the HTTP API fails in auto mode", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "auto";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example";
    mockApiPost.mockRejectedValue(new Error("Request timed out"));

    await expect(getRecommendations("original", profile, 2)).resolves.toBe(recommendations);
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockGetProduct).toHaveBeenCalledWith("original");
    expect(mockGetCandidates).toHaveBeenCalledWith(original, 200);
    expect(mockGetAlternatives).toHaveBeenCalledWith(original, candidates, profile, 2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("falling back to Firestore"),
      expect.any(Error)
    );
  });

  it("surfaces a Firestore fallback failure in auto mode", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "auto";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example";
    mockApiPost.mockRejectedValue(new Error("Request timed out"));
    mockGetProduct.mockRejectedValue(new Error("Firestore unavailable"));

    await expect(getRecommendations("original", profile)).rejects.toMatchObject({
      message: "Firestore unavailable",
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockGetProduct).toHaveBeenCalledWith("original");
  });

  it("returns an empty result only when Firestore has no original product", async () => {
    process.env.EXPO_PUBLIC_API_SOURCE = "firestore";
    mockGetProduct.mockResolvedValue(null);

    await expect(getRecommendations("missing", profile)).resolves.toEqual([]);
    expect(mockGetCandidates).not.toHaveBeenCalled();
  });
});
