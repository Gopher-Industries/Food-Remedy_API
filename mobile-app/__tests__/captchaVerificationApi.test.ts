import {
  createCaptchaVerificationHandler,
  MAX_CAPTCHA_REQUEST_BYTES,
} from "@/server/captchaVerificationHandler";

const TOKEN = "captcha-token-private";
const SECRET = "captcha-secret-private";

function request(body: unknown): Request {
  return new Request("http://localhost/api/verify-captcha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<{ verified: boolean }> {
  return response.json();
}

describe("BE072 hCaptcha verification API", () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns only verified=true after successful provider verification", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, hostname: "private.example" }), { status: 200 })
    );
    const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
      request({ token: TOKEN })
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ verified: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.hcaptcha.com/siteverify",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) })
    );
  });

  it.each([{}, { token: "" }, { token: "   " }, { token: 123 }])(
    "rejects a missing or empty token: %p",
    async invalidBody => {
      const fetchImpl = jest.fn();
      const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
        request(invalidBody)
      );
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({ verified: false });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("rejects invalid or expired provider tokens", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: false,
        "error-codes": ["invalid-or-already-seen-response"],
      }), { status: 200 })
    );
    const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
      request({ token: TOKEN })
    );
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ verified: false });
  });

  it.each([
    ["invalid JSON", new Response("not-json", { status: 200 })],
    ["missing success boolean", new Response(JSON.stringify({ success: "yes" }), { status: 200 })],
  ])("fails closed for a malformed provider response: %s", async (_name, providerResponse) => {
    const fetchImpl = jest.fn().mockResolvedValue(providerResponse);
    const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
      request({ token: TOKEN })
    );
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ verified: false });
  });

  it("fails closed when provider verification times out", async () => {
    const fetchImpl = jest.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    }));
    const response = await createCaptchaVerificationHandler({
      secret: SECRET,
      fetchImpl,
      timeoutMs: 1,
    })(request({ token: TOKEN }));
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ verified: false });
  });

  it.each([
    ["network failure", jest.fn().mockRejectedValue(new Error("provider network detail"))],
    ["provider failure", jest.fn().mockResolvedValue(new Response("unavailable", { status: 502 }))],
  ])("fails closed for %s", async (_name, fetchImpl) => {
    const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
      request({ token: TOKEN })
    );
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ verified: false });
  });

  it("fails closed when the server secret is missing", async () => {
    const fetchImpl = jest.fn();
    const response = await createCaptchaVerificationHandler({ fetchImpl })(request({ token: TOKEN }));
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ verified: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an oversized request before calling the provider", async () => {
    const fetchImpl = jest.fn();
    const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
      request({ token: "x".repeat(MAX_CAPTCHA_REQUEST_BYTES) })
    );
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ verified: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never logs or returns the submitted token, secret, or provider data", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, private: "provider-private-data" }), { status: 200 })
    );
    const response = await createCaptchaVerificationHandler({ secret: SECRET, fetchImpl })(
      request({ token: TOKEN })
    );
    const responseText = await response.text();
    const logs = JSON.stringify([
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]);

    expect(responseText).toBe('{"verified":false}');
    for (const sensitive of [TOKEN, SECRET, "provider-private-data"]) {
      expect(responseText).not.toContain(sensitive);
      expect(logs).not.toContain(sensitive);
    }
  });
});
