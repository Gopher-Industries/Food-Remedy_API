import { POST } from "../app/api/verify-captcha/route";

const originalEnv = process.env;

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/verify-captcha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json();
}

describe("verify-captcha route", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      HCAPTCHA_SECRET_KEY: "server-secret",
    };
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn() as jest.Mock;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = originalEnv;
  });

  it("approves a valid token without logging the token", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    const response = await POST(jsonRequest({ token: "valid-token" }));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ verified: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("valid-token");
  });

  it("rejects a missing token and does not call hCaptcha", async () => {
    const response = await POST(jsonRequest({}));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      verified: false,
      message: "Captcha verification is required.",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid token without logging the token", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
        { status: 200 }
      )
    );

    const response = await POST(jsonRequest({ token: "invalid-token" }));
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.verified).toBe(false);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("invalid-token");
  });

  it("rejects an expired token according to the provider response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
        { status: 200 }
      )
    );

    const response = await POST(jsonRequest({ token: "expired-token" }));

    expect(response.status).toBe(403);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("expired-token");
  });

  it("rejects a replayed token according to the provider response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          "error-codes": ["invalid-or-already-seen-response"],
        }),
        { status: 200 }
      )
    );

    const response = await POST(jsonRequest({ token: "replayed-token" }));

    expect(response.status).toBe(403);
    expect(warnSpy).toHaveBeenCalledWith("[Captcha] verification failed", {
      reason: "invalid_or_replayed_token",
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("replayed-token");
  });

  it("fails closed when hCaptcha is unavailable", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response("Unavailable", { status: 503 })
    );

    const response = await POST(jsonRequest({ token: "provider-down-token" }));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body).toEqual({
      verified: false,
      message: "Captcha verification is temporarily unavailable.",
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("provider-down-token");
  });

  it("fails closed when hCaptcha times out", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("Aborted"), { name: "AbortError" })
    );

    const response = await POST(jsonRequest({ token: "timeout-token" }));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.verified).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith("[Captcha] verification failed", {
      reason: "provider_timeout",
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("timeout-token");
  });

  it("fails closed when the server secret is missing", async () => {
    delete process.env.HCAPTCHA_SECRET_KEY;

    const response = await POST(jsonRequest({ token: "secret-missing-token" }));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.verified).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("secret-missing-token");
  });
});
