export const MAX_CAPTCHA_REQUEST_BYTES = 8_192;
export const MAX_CAPTCHA_TOKEN_LENGTH = 4_096;
export const DEFAULT_CAPTCHA_TIMEOUT_MS = 5_000;

const HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify";

type CaptchaFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface CaptchaVerificationDependencies {
  secret?: string;
  fetchImpl?: CaptchaFetch;
  timeoutMs?: number;
}

function json(verified: boolean, status: number): Response {
  return new Response(JSON.stringify({ verified }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readBoundedToken(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CAPTCHA_REQUEST_BYTES) {
    return null;
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CAPTCHA_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    try { reader.releaseLock(); } catch { /* A cancelled stream may remain locked briefly. */ }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const token = (value as { token?: unknown }).token;
    if (typeof token !== "string") return null;
    const normalized = token.trim();
    if (!normalized || normalized.length > MAX_CAPTCHA_TOKEN_LENGTH) return null;
    return normalized;
  } catch {
    return null;
  }
}

/** Creates a bounded, fail-closed hCaptcha verification endpoint. */
export function createCaptchaVerificationHandler(
  dependencies: CaptchaVerificationDependencies
) {
  const fetchImpl = dependencies.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_CAPTCHA_TIMEOUT_MS;

  return async function postVerifyCaptcha(request: Request): Promise<Response> {
    const token = await readBoundedToken(request);
    if (!token) return json(false, 400);

    const secret = dependencies.secret?.trim();
    if (!secret) return json(false, 503);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new URLSearchParams();
      form.set("secret", secret);
      form.set("response", token);

      const providerResponse = await fetchImpl(HCAPTCHA_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal,
      });
      if (!providerResponse.ok) return json(false, 503);

      let providerResult: unknown;
      try {
        providerResult = await providerResponse.json();
      } catch {
        return json(false, 503);
      }

      if (!providerResult || typeof providerResult !== "object" || Array.isArray(providerResult)) {
        return json(false, 503);
      }
      const success = (providerResult as { success?: unknown }).success;
      if (success === true) return json(true, 200);
      if (success === false) return json(false, 403);
      return json(false, 503);
    } catch {
      return json(false, 503);
    } finally {
      clearTimeout(timer);
    }
  };
}
