// Normalise different error shapes into a predictable object
export type NormalizedError = {
  status?: number | null;
  code?: string | null;
  message: string;
  retryable?: boolean;
  original?: any;
};

export function normalizeError(err: any): NormalizedError {
  if (!err) return { message: "Unknown error", retryable: false };

  // If already normalized
  if (err && typeof err === "object" && err.message && (err.status || err.code)) {
    return { status: err.status ?? null, code: err.code ?? null, message: err.message, retryable: !!err.retryable, original: err };
  }

  // Fetch / HTTP error wrapper
  if (err && typeof err === "object") {
    const status = err.status ?? err.statusCode ?? null;
    const body = err.body ?? err.response ?? null;
    const message = (body && (body.message || body.error || JSON.stringify(body))) || err.message || "Request failed";
    const code = body && (body.code || body.errorCode) || null;
    const retryable = status && (status >= 500 || status === 429) ? true : false;
    return { status, code, message: String(message), retryable, original: err };
  }

  // Fallback for string/other
  return { message: String(err), retryable: false, original: err };
}
