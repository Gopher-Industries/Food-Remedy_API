import { requestAccountDeletion } from "../services/api/accountDeletion";
import { auth } from "../config/firebaseConfig";

jest.mock("../config/firebaseConfig", () => ({
  auth: { currentUser: null },
}));

describe("requestAccountDeletion", () => {
  const currentUser = {
    getIdToken: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.test/";
    (auth as { currentUser: typeof currentUser | null }).currentUser = currentUser;
    currentUser.getIdToken.mockResolvedValue("fresh-firebase-token");
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          requestId: "opaque-request-123",
          state: "accepted",
          accepted: true,
          duplicate: false,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  });

  it("sends only the authenticated token and no UID selector", async () => {
    await expect(requestAccountDeletion()).resolves.toMatchObject({
      requestId: "opaque-request-123",
      state: "accepted",
    });

    expect(currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.test/account-deletion",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          Authorization: "Bearer fresh-firebase-token",
        }),
      }),
    );
  });
});