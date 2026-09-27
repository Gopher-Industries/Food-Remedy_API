const REDACTED = "[REDACTED]";

export const PUBLIC_SERVER_ERROR_MESSAGE =
  "Unexpected error. Please try again later.";

export function safePublicMessage(fallback = PUBLIC_SERVER_ERROR_MESSAGE): string {
  return fallback;
}

/** Provider errors can contain tokens, request bodies, profile data, and URLs.
 * Keep the static call-site label for diagnosis, and discard all provider text.
 */
export function redactSensitive(value: unknown): string {
  return value instanceof Error ? "Error" : REDACTED;
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
