type VerifyCaptchaRequest = {
  token?: string;
};

type HCaptchaResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

const HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify";
const DEFAULT_TIMEOUT_MS = 5000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getTimeoutMs(): number {
  const configured = Number(process.env.HCAPTCHA_VERIFY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

async function readRequestBody(
  request: Request
): Promise<VerifyCaptchaRequest | null> {
  try {
    return (await request.json()) as VerifyCaptchaRequest;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function logCaptchaVerificationFailure(reason: string): void {
  console.warn("[Captcha] verification failed", { reason });
}

export async function POST(request: Request): Promise<Response> {
  const body = await readRequestBody(request);
  const token = body?.token;

  if (!token || typeof token !== "string") {
    logCaptchaVerificationFailure("missing_token");
    return jsonResponse(
      {
        verified: false,
        message: "Captcha verification is required.",
      },
      400
    );
  }

  const secret = process.env.HCAPTCHA_SECRET_KEY;

  if (!secret) {
    logCaptchaVerificationFailure("missing_server_secret");
    return jsonResponse(
      {
        verified: false,
        message: "Captcha verification is temporarily unavailable.",
      },
      503
    );
  }

  const formBody = new URLSearchParams();
  formBody.set("secret", secret);
  formBody.set("response", token);

  try {
    const providerResponse = await fetchWithTimeout(
      HCAPTCHA_VERIFY_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      },
      getTimeoutMs()
    );

    if (!providerResponse.ok) {
      logCaptchaVerificationFailure("provider_unavailable");
      return jsonResponse(
        {
          verified: false,
          message: "Captcha verification is temporarily unavailable.",
        },
        503
      );
    }

    const result = (await providerResponse.json()) as HCaptchaResponse;

    if (result?.success === true) {
      return jsonResponse({ verified: true });
    }

    const reason = result?.["error-codes"]?.includes("invalid-or-already-seen-response")
      ? "invalid_or_replayed_token"
      : "provider_rejected_token";

    logCaptchaVerificationFailure(reason);
    return jsonResponse(
      {
        verified: false,
        message: "Captcha verification failed. Please try again.",
      },
      403
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "provider_timeout"
        : "provider_error";

    logCaptchaVerificationFailure(reason);
    return jsonResponse(
      {
        verified: false,
        message: "Captcha verification is temporarily unavailable.",
      },
      503
    );
  }
}
