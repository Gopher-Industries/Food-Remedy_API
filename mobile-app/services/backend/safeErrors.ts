const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|token|accessToken|refreshToken|idToken|email|uid|userId|allerg(?:y|ies)|intolerances?|dietaryPreferences|diet|health|medicalConditions?|conditions?|restrictions?|profile|rawBody|providerBody|responseBody)$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\b(?:Bearer|Firebase)\s+[A-Za-z0-9._~+\/-]+=*/gi;
const TOKEN_QUERY = /([?&](?:token|access_token|auth|key)=)[^&#\s]+/gi;

export type ErrorCode =
  | "INVALID_REQUEST"
  | "PRODUCT_NOT_FOUND"
  | "CLASSIFICATION_FAILED"
  | "MEAL_PLAN_FAILED"
  | "PRODUCT_DETAIL_FAILED"
  | "FEEDBACK_SUBMISSION_FAILED"
  | "AVATAR_STORAGE_FAILED";

export interface ErrorEnvelope {
  error: ErrorCode;
  message: string;
  requestId: string;
}

export class SafeServiceError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly requestId: string) {
    super(message);
    this.name = "SafeServiceError";
  }
}

function redactString(value: string): string {
  return value.replace(EMAIL, REDACTED).replace(BEARER, REDACTED).replace(TOKEN_QUERY, `$1${REDACTED}`);
}

export function redactForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.test(key) ? REDACTED : redactForLog(item, seen),
    ])
  );
}

function newRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getRequestId(request?: Request): string {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._-]{8,128}$/.test(supplied) ? supplied : newRequestId();
}

export function errorEnvelope(code: ErrorCode, message: string, requestId: string): ErrorEnvelope {
  return { error: code, message, requestId };
}

export function jsonResponse(body: unknown, status = 200, requestId?: string): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

type LogLevel = "info" | "warn" | "error";

export function safeLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === "test") return;
  const entry = redactForLog({ level, event, ...fields, timestamp: new Date().toISOString() });
  const output = process.env.NODE_ENV === "production" ? JSON.stringify(entry) : entry;
  console[level](output);
}
