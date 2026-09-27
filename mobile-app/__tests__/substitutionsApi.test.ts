import { fetchSubstitutions } from "@/services/substitutions";

describe("substitution API client", () => {
  const originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
    jest.restoreAllMocks();
  });

  it("sends the Firebase token and selected profile to the bounded endpoint", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:3000/";
    const response = {
      contractVersion: "1.0",
      status: "empty",
      source: { barcode: "10000001", productName: "Bread", categoryKeys: ["breads"] },
      substitutions: [],
      emptyState: { code: "NO_SAFE_SUBSTITUTES", message: "No safe substitute." },
      meta: { requestId: "test", algorithmVersion: "be033-v1", candidateCount: 1, evaluatedCount: 1, returnedCount: 0 },
    };
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    await expect(fetchSubstitutions({ barcode: "10000001", profileId: "profile-1", idToken: "token", limit: 99 })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/scan/substitutions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
        body: JSON.stringify({ barcode: "10000001", profileId: "profile-1", limit: 10 }),
      })
    );
  });

  it("rejects an unsupported response instead of displaying unchecked products", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:3000";
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ alternatives: [] }) } as Response);
    await expect(fetchSubstitutions({ barcode: "10000001", profileId: "profile-1", idToken: "token" })).rejects.toThrow(/unsupported response/i);
  });
});
