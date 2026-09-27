import { apiPost } from "@/services/apiClient";
import {
  CaptchaVerificationError,
  verifyCaptchaToken,
} from "@/services/security/verifyCaptchaToken";

jest.mock("@/services/apiClient", () => ({ apiPost: jest.fn() }));

describe("BE072 CAPTCHA client", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the token only to the verification endpoint", async () => {
    (apiPost as jest.Mock).mockResolvedValue({ verified: true });
    await expect(verifyCaptchaToken("client-token")).resolves.toBeUndefined();
    expect(apiPost).toHaveBeenCalledWith("/api/verify-captcha", { token: "client-token" });
  });

  it.each([
    { verified: false },
    { verified: "true" },
    {},
  ])("rejects non-success responses without logging the token: %p", async providerResult => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (apiPost as jest.Mock).mockResolvedValue(providerResult);

    await expect(verifyCaptchaToken("private-client-token"))
      .rejects.toBeInstanceOf(CaptchaVerificationError);
    expect(JSON.stringify([
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ])).not.toContain("private-client-token");

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
