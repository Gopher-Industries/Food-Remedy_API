import {
  createProductSubmissionHandler,
  type ProductSubmissionHandlerDependencies,
} from "@/server/productSubmissionHandler";
import {
  ProductAlreadyExistsError,
  SubmissionRateLimitError,
  SubmissionStorageTimeoutError,
} from "@/server/productSubmissions";

const BARCODE = "036000291452";

function createDependencies(): ProductSubmissionHandlerDependencies {
  return {
    tokenVerifier: {
      verifyIdToken: jest.fn().mockResolvedValue({ uid: "verified-user" }),
    },
    submissionStore: {
      submit: jest.fn().mockResolvedValue({
        submissionId: `ps_${BARCODE}`,
        barcode: BARCODE,
        status: "PENDING",
        idempotent: false,
      }),
    },
  };
}

function authenticatedRequest(body: unknown): Request {
  return new Request("http://localhost/api/product-submissions", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    version: "v1",
    barcode: BARCODE,
    ...overrides,
  };
}

describe("POST /api/product-submissions", () => {
  it("requires a verified bearer token before reading or storing a submission", async () => {
    const dependencies = createDependencies();
    const handler = createProductSubmissionHandler(dependencies);
    const response = await handler(
      new Request("http://localhost/api/product-submissions", {
        method: "POST",
        body: JSON.stringify(validBody()),
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      version: "v1",
      error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
    });
    expect(dependencies.submissionStore.submit).not.toHaveBeenCalled();
  });

  it("derives the reporter only from verified authentication and rejects userId", async () => {
    const dependencies = createDependencies();
    const handler = createProductSubmissionHandler(dependencies);
    const response = await handler(authenticatedRequest(validBody({ userId: "other-user" })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      version: "v1",
      error: { code: "UNSUPPORTED_FIELD", message: "Request contains an unsupported field." },
    });
    expect(dependencies.submissionStore.submit).not.toHaveBeenCalled();
  });

  it.each([
    "96385074",
    "036000291452",
    "4006381333931",
    "00012345600012",
  ])("accepts each supported GTIN length and preserves %s", async (barcode) => {
    const dependencies = createDependencies();
    const handler = createProductSubmissionHandler(dependencies);
    const response = await handler(authenticatedRequest(validBody({ barcode: ` ${barcode} ` })));

    expect(response.status).toBe(201);
    expect(dependencies.submissionStore.submit).toHaveBeenCalledWith(
      "verified-user",
      expect.objectContaining({ barcode })
    );
  });

  it.each([
    ["characters", "03600a291452"],
    ["length", "1234567"],
    ["check digit", "036000291453"],
    ["empty", ""],
  ])("rejects a barcode with invalid %s", async (_reason, barcode) => {
    const dependencies = createDependencies();
    const response = await createProductSubmissionHandler(dependencies)(
      authenticatedRequest(validBody({ barcode }))
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_BARCODE");
    expect(dependencies.submissionStore.submit).not.toHaveBeenCalled();
  });

  it("normalizes bounded text but rejects empty, oversized, and control-character values", async () => {
    const dependencies = createDependencies();
    const handler = createProductSubmissionHandler(dependencies);
    const accepted = await handler(
      authenticatedRequest(validBody({ productName: "  Sparkling   Water  ", note: "Store shelf was empty" }))
    );

    expect(accepted.status).toBe(201);
    expect(dependencies.submissionStore.submit).toHaveBeenCalledWith(
      "verified-user",
      expect.objectContaining({
        productName: "Sparkling Water",
        note: "Store shelf was empty",
      })
    );

    for (const body of [
      validBody({ brand: "   " }),
      validBody({ note: "x".repeat(501) }),
      validBody({ retailer: "Shop\u0000Name" }),
    ]) {
      const response = await handler(authenticatedRequest(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    }
  });

  it("rejects malformed JSON, unsupported fields, and oversized payloads predictably", async () => {
    const dependencies = createDependencies();
    const handler = createProductSubmissionHandler(dependencies);

    const malformed = await handler(
      new Request("http://localhost/api/product-submissions", {
        method: "POST",
        headers: { Authorization: "Bearer verified-token" },
        body: "{not-json",
      })
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_REQUEST");

    const unsupported = await handler(authenticatedRequest(validBody({ unexpected: true })));
    expect(unsupported.status).toBe(400);
    expect((await unsupported.json()).error.code).toBe("UNSUPPORTED_FIELD");

    const oversized = await handler(
      authenticatedRequest(validBody({ note: "x".repeat(2_100) }))
    );
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error.code).toBe("REQUEST_TOO_LARGE");
  });

  it("returns the stable pending submission on an idempotent repeat", async () => {
    const dependencies = createDependencies();
    (dependencies.submissionStore.submit as jest.Mock).mockResolvedValue({
      submissionId: `ps_${BARCODE}`,
      barcode: BARCODE,
      status: "PENDING",
      idempotent: true,
    });

    const response = await createProductSubmissionHandler(dependencies)(
      authenticatedRequest(validBody())
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: "v1",
      submissionId: `ps_${BARCODE}`,
      barcode: BARCODE,
      status: "PENDING",
      idempotent: true,
    });
  });

  it("returns sanitized duplicate, rate-limit, timeout, and storage-failure responses", async () => {
    const scenarios = [
      {
        failure: new ProductAlreadyExistsError("barcode and user data must stay private"),
        status: 409,
        code: "PRODUCT_ALREADY_EXISTS",
      },
      {
        failure: new SubmissionRateLimitError(120),
        status: 429,
        code: "RATE_LIMITED",
      },
      {
        failure: new SubmissionStorageTimeoutError("Firestore timed out for reporter@example.com"),
        status: 503,
        code: "SUBMISSION_UNAVAILABLE",
      },
      {
        failure: new Error("Firestore write failed for Store shelf note"),
        status: 503,
        code: "SUBMISSION_UNAVAILABLE",
      },
    ];

    for (const scenario of scenarios) {
      const dependencies = createDependencies();
      (dependencies.submissionStore.submit as jest.Mock).mockRejectedValue(scenario.failure);
      const response = await createProductSubmissionHandler(dependencies)(
        authenticatedRequest(validBody())
      );
      const body = await response.json();

      expect(response.status).toBe(scenario.status);
      expect(body.error.code).toBe(scenario.code);
      expect(JSON.stringify(body)).not.toContain("reporter@example.com");
      expect(JSON.stringify(body)).not.toContain("Store shelf note");
    }
  });
});
