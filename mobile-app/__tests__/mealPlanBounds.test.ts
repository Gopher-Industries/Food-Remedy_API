jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
}));

import { collection, getDocs, limit, query } from "firebase/firestore";
import { MEAL_PLAN_LIMITS, POST } from "@/app/api/7-day-meal-plan/+api";

const mockedCollection = collection as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedLimit = limit as jest.Mock;
const mockedQuery = query as jest.Mock;
const originalFetch = globalThis.fetch;

function jsonRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/7-day-meal-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function productSnapshot(count: number) {
  return {
    empty: false,
    docs: Array.from({ length: count }, (_, index) => ({
      id: `product-${index + 1}`,
      data: () => ({
        barcode: `product-${index + 1}`,
        productName: `Product ${index + 1}`,
        categories: ["meal-kits"],
      }),
    })),
  };
}

function classificationResponse(barcode: string): Response {
  return new Response(JSON.stringify({
    barcode,
    colour: "green",
    score: 100,
    reasons: [],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function barcodeFromFetch(options?: RequestInit): string {
  return JSON.parse(String(options?.body)).barcode;
}

async function flushWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("POST /api/7-day-meal-plan bounds and failure handling", () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    mockedCollection.mockReturnValue({ path: "PRODUCTS" });
    mockedLimit.mockImplementation((value: number) => ({ value }));
    mockedQuery.mockImplementation((value: unknown) => value);
    mockedGetDocs.mockResolvedValue(productSnapshot(1));
    globalThis.fetch = jest.fn((_url: string, options?: RequestInit) => (
      Promise.resolve(classificationResponse(barcodeFromFetch(options)))
    )) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    ["a numeric string", { productLimit: "2" }],
    ["zero", { productLimit: 0 }],
    ["a decimal", { productLimit: 1.5 }],
    ["an oversized limit", { productLimit: MEAL_PLAN_LIMITS.maxProductLimit + 1 }],
    ["an unsupported diet", { dietType: "pescatarian" }],
    ["a malformed restriction list", { allergens: "peanut" }],
    ["an overlong profile value", { profileName: "a".repeat(MEAL_PLAN_LIMITS.maxProfileStringLength + 1) }],
  ])("rejects %s without accessing Firestore", async (_caseName, body) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "INVALID_REQUEST",
      message: "Request body does not match the meal-plan schema.",
    });
    expect(mockedGetDocs).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, including NaN, without coercing it", async () => {
    const response = await POST(new Request("http://localhost/api/7-day-meal-plan", {
      method: "POST",
      body: '{"productLimit":NaN}',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "INVALID_REQUEST",
      message: "Request body does not match the meal-plan schema.",
    });
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it("caps a large candidate set at four active classifiers in deterministic batches", async () => {
    const candidateCount = MEAL_PLAN_LIMITS.maxProductLimit;
    mockedGetDocs.mockResolvedValue(productSnapshot(candidateCount));

    let active = 0;
    let maxActive = 0;
    const pending: Array<() => void> = [];
    const fetchMock = jest.fn((_url: string, options?: RequestInit) => new Promise<Response>((resolve) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const barcode = barcodeFromFetch(options);
      pending.push(() => {
        active -= 1;
        resolve(classificationResponse(barcode));
      });
    }));
    globalThis.fetch = fetchMock as jest.Mock;

    const responsePromise = POST(jsonRequest({ productLimit: candidateCount }));
    await flushWork();

    expect(fetchMock).toHaveBeenCalledTimes(MEAL_PLAN_LIMITS.classificationConcurrency);

    while (fetchMock.mock.calls.length < candidateCount || pending.length > 0) {
      const batch = pending.splice(0);
      expect(batch.length).toBeGreaterThan(0);
      batch.forEach((complete) => complete());
      await flushWork();
    }

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(candidateCount);
    expect(maxActive).toBe(MEAL_PLAN_LIMITS.classificationConcurrency);
    expect(mockedLimit).toHaveBeenCalledWith(candidateCount);
  });

  it("excludes failed classifications, returns a partial plan, and hides provider details", async () => {
    mockedGetDocs.mockResolvedValue(productSnapshot(3));
    globalThis.fetch = jest.fn((_url: string, options?: RequestInit) => {
      const barcode = barcodeFromFetch(options);
      if (barcode === "product-2") {
        return Promise.resolve(new Response("provider-stacktrace: internal-host-42", { status: 502 }));
      }
      return Promise.resolve(classificationResponse(barcode));
    }) as jest.Mock;

    const response = await POST(jsonRequest({ productLimit: 3 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.warning).toContain("1 products could not be classified");
    expect(JSON.stringify(body)).not.toContain("provider-stacktrace");
    expect(JSON.stringify(body)).not.toContain("internal-host-42");
  });

  it("aborts a slow classification after its deadline and returns a sanitized unavailable response", async () => {
    jest.useFakeTimers();
    let classifierSignal: AbortSignal | undefined;
    globalThis.fetch = jest.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      classifierSignal = options?.signal ?? undefined;
      classifierSignal?.addEventListener("abort", () => reject(new Error("provider secret")), { once: true });
    })) as jest.Mock;

    const responsePromise = POST(jsonRequest({ productLimit: 1 }));
    await jest.advanceTimersByTimeAsync(MEAL_PLAN_LIMITS.classificationTimeoutMs);
    const response = await responsePromise;

    expect(classifierSignal?.aborted).toBe(true);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "CLASSIFICATION_UNAVAILABLE",
      message: "Meal-plan generation is temporarily unavailable. Please try again.",
    });
  });

  it("aborts in-flight classifiers and returns a timeout when the total request budget expires", async () => {
    jest.useFakeTimers();
    const candidateCount = 25;
    mockedGetDocs.mockResolvedValue(productSnapshot(candidateCount));
    const classifierSignals: AbortSignal[] = [];
    globalThis.fetch = jest.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal;
      if (signal) {
        classifierSignals.push(signal);
        signal.addEventListener("abort", () => reject(new Error("provider secret")), { once: true });
      }
    })) as jest.Mock;

    const responsePromise = POST(jsonRequest({ productLimit: candidateCount }));
    await jest.advanceTimersByTimeAsync(MEAL_PLAN_LIMITS.requestTimeoutMs);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: "REQUEST_TIMEOUT",
      message: "Meal-plan generation timed out. Please try again.",
    });
    expect(classifierSignals).not.toHaveLength(0);
    expect(classifierSignals.every((signal) => signal.aborted)).toBe(true);
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeLessThan(candidateCount);
  });

  it("propagates a client cancellation to active classifiers", async () => {
    const abortController = new AbortController();
    let classifierSignal: AbortSignal | undefined;
    globalThis.fetch = jest.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      classifierSignal = options?.signal ?? undefined;
      classifierSignal?.addEventListener("abort", () => reject(new Error("provider secret")), { once: true });
    })) as jest.Mock;

    const responsePromise = POST(jsonRequest({ productLimit: 1 }, abortController.signal));
    await flushWork();
    abortController.abort();
    const response = await responsePromise;

    expect(classifierSignal?.aborted).toBe(true);
    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({
      error: "REQUEST_ABORTED",
      message: "Meal-plan generation was cancelled.",
    });
  });

  it("sanitizes unexpected Firestore failures", async () => {
    const logger = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedGetDocs.mockRejectedValue(new Error("postgres://internal-host-42/meal-plan"));

    const response = await POST(jsonRequest({ productLimit: 1 }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "SERVER_ERROR",
      message: "Unexpected error while generating 7-day meal plan.",
    });
    expect(JSON.stringify(body)).not.toContain("internal-host-42");
    logger.mockRestore();
  });
});
