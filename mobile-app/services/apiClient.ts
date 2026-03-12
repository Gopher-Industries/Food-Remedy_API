// Lightweight API client with GET/POST/PUT helpers and centralized JSON/error handling
import { normalizeError } from "./errorHandler";

const DEFAULT_TIMEOUT = 15000; // ms

function buildUrl(path: string) {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL || "";
  const source = String(process.env.EXPO_PUBLIC_API_SOURCE || "auto").toLowerCase();
  if (source === "firestore") {
    throw Object.assign(new Error("REST client disabled in firestore mode"), { code: "REST_DISABLED" });
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}

async function timeoutPromise<T>(promise: Promise<T>, ms = DEFAULT_TIMEOUT) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Request timed out")), ms);
  });
  const res = await Promise.race([promise, timeout]) as T;
  clearTimeout(timeoutId as any);
  return res;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const url = buildUrl(path);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> || {}),
  };

  // Inject auth token if available via global (adapt as needed)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAuthToken } = require("@/services/authToken");
    if (typeof getAuthToken === "function") {
      const token = getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // silently ignore if auth helper not present
  }

  try {
    const res = await timeoutPromise(fetch(url, { ...init, headers }), DEFAULT_TIMEOUT);
    const response = res as Response;
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw normalizeError({ status: response.status, body: data });
    }
    return data as T;
  } catch (err: any) {
    throw normalizeError(err);
  }
}

export const apiGet = <T,>(path: string) => request<T>(path, { method: "GET" });
export const apiPost = <T,>(path: string, body: any) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T,>(path: string, body: any) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export default { apiGet, apiPost, apiPut };
