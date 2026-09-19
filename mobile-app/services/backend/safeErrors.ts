const REDACTED = "[REDACTED]";

const sensitivePatterns: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /https?:\/\/[^\s"'<>]+/gi,
  /\b[a-z0-9-]+\.appspot\.com\b/gi,
  /\bprojectId=[^\s"'<>]+/gi,
  /\bbucket=[^\s"'<>]+/gi,
  /\buid=[^\s"'<>]+/gi,
  /\btoken=[^\s"'<>]+/gi,
  /\b(Firebase|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  /at\s+.+\(.+:\d+:\d+\)/g,
  /\bbody=[\s\S]+$/gi,
  /\b(downloadTokens|firebaseStorageDownloadTokens)\b\s*[:=]\s*["']?[^"',}\s]+/gi,
  /\b(profileHealth|healthScore|medicalNotes)\b\s*[:=]\s*["']?[^"',}\n]+/gi,
];

const sensitiveKeys = new Set([
  "accessToken",
  "authToken",
  "body",
  "bucket",
  "downloadTokens",
  "email",
  "firebaseStorageDownloadTokens",
  "healthScore",
  "idToken",
  "message",
  "medicalNotes",
  "profileHealth",
  "projectId",
  "response",
  "stack",
  "token",
  "uid",
  "url",
]);

export const PUBLIC_SERVER_ERROR_MESSAGE =
  "Unexpected error. Please try again later.";

export function safePublicMessage(fallback = PUBLIC_SERVER_ERROR_MESSAGE): string {
  return fallback;
}

export function redactSensitive(value: unknown): string {
  let text = value instanceof Error
    ? stringifyError(value)
    : stringifyForLog(value);

  for (const pattern of sensitivePatterns) {
    text = text.replace(pattern, REDACTED);
  }

  return text;
}

export function logSafeError(message: string, error?: unknown): void {
  if (error === undefined) {
    console.error(message);
    return;
  }

  console.error(message, redactSensitive(error));
}

export function logSafeWarn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(message);
    return;
  }

  console.warn(message, redactSensitive(error));
}

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, (key, nestedValue) =>
      sensitiveKeys.has(key) ? REDACTED : nestedValue
    );
  } catch {
    return String(value);
  }
}

function stringifyError(error: Error): string {
  const maybeCode = (error as Error & { code?: unknown }).code;
  const code = typeof maybeCode === "string" ? ` code=${maybeCode}` : "";

  return `${error.name || "Error"}${code}`;
}
