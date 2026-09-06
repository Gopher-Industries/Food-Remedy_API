import { verifyCaptchaToken } from "@/services/security/verifyCaptchaToken";
import { apiPost } from "@/services/apiClient";

jest.mock("@/services/apiClient", () => ({
  apiPost: jest.fn(),
}));

describe("verifyCaptchaToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends the captcha token to the server verification endpoint", async () => {
    (apiPost as jest.Mock).mockResolvedValueOnce({ verified: true });

    await verifyCaptchaToken("client-token");

    expect(apiPost).toHaveBeenCalledWith("/verify-captcha", {
      token: "client-token",
    });
  });

  it("rejects when the server does not verify the token", async () => {
    (apiPost as jest.Mock).mockResolvedValueOnce({
      verified: false,
      message: "Captcha verification failed. Please try again.",
    });

    await expect(verifyCaptchaToken("bad-token")).rejects.toThrow(
      "Captcha verification failed. Please try again."
    );
  });
});
