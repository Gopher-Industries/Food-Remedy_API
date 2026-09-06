import { errorEnvelope, getRequestId, redactForLog, safeLog } from "@/services/backend/safeErrors";

describe("privacy-safe backend errors", () => {
  it("keeps the shared error envelope stable", () => {
    expect(errorEnvelope("MEAL_PLAN_FAILED", "Unable to generate meal plan.", "trace_12345678"))
      .toMatchInlineSnapshot(`
      {
        "error": "MEAL_PLAN_FAILED",
        "message": "Unable to generate meal plan.",
        "requestId": "trace_12345678",
      }
    `);
  });

  it("redacts explicit privacy and provider fixtures recursively", () => {
    const fixture = {
      authorization: "Bearer top-secret-token",
      email: "person@example.com",
      uid: "firebase-user-123",
      profile: {
        allergies: ["peanuts"],
        medicalConditions: ["diabetes"],
      },
      providerBody: '{"error":"account person@example.com failed"}',
      nested: {
        message: "contact person@example.com using Bearer abc.def.ghi uid=firebase-user-123",
        url: "https://provider.invalid/file?token=download-secret&safe=yes",
        firebasePath: "USERS/firebase-user-123/PROFILES/profile-456",
      },
      api_key: "provider-api-key",
      provider_response: "raw upstream payload",
    };

    const sanitized = JSON.stringify(redactForLog(fixture));
    expect(sanitized).not.toContain("person@example.com");
    expect(sanitized).not.toContain("firebase-user-123");
    expect(sanitized).not.toContain("peanuts");
    expect(sanitized).not.toContain("diabetes");
    expect(sanitized).not.toContain("top-secret-token");
    expect(sanitized).not.toContain("download-secret");
    expect(sanitized).not.toContain("provider-api-key");
    expect(sanitized).not.toContain("raw upstream payload");
    expect(sanitized).toMatchInlineSnapshot(
      `"{\"authorization\":\"[REDACTED]\",\"email\":\"[REDACTED]\",\"uid\":\"[REDACTED]\",\"profile\":\"[REDACTED]\",\"providerBody\":\"[REDACTED]\",\"nested\":{\"message\":\"contact [REDACTED] using [REDACTED] uid=[REDACTED]\",\"url\":\"https://provider.invalid/file?token=[REDACTED]&safe=yes\",\"firebasePath\":\"USERS/[REDACTED]/PROFILES/profile-456\"},\"api_key\":\"[REDACTED]\",\"provider_response\":\"[REDACTED]\"}"`
    );
  });

  it("emits sanitized structured JSON in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const output = jest.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.NODE_ENV = "production";

    try {
      safeLog("error", "provider.failed", {
        requestId: "trace_12345678",
        error: new Error("USERS/firebase-user-123 failed for person@example.com"),
        response_body: "private provider response",
      });

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0] as string);
      expect(entry).toMatchObject({
        level: "error",
        event: "provider.failed",
        requestId: "trace_12345678",
        response_body: "[REDACTED]",
        error: { name: "Error", message: "USERS/[REDACTED] failed for [REDACTED]" },
      });
      expect(output.mock.calls[0][0]).not.toContain("firebase-user-123");
      expect(output.mock.calls[0][0]).not.toContain("person@example.com");
      expect(entry.timestamp).toEqual(expect.any(String));
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      output.mockRestore();
    }
  });

  it("accepts only bounded safe correlation identifiers", () => {
    expect(getRequestId(new Request("https://example.test", { headers: { "x-request-id": "trace_12345678" } })))
      .toBe("trace_12345678");
    expect(getRequestId(new Request("https://example.test", { headers: { "x-request-id": "bad id with spaces" } })))
      .not.toBe("bad id with spaces");
  });
});
