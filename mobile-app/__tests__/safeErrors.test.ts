import { errorEnvelope, getRequestId, redactForLog } from "@/services/backend/safeErrors";

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
        message: "contact person@example.com using Bearer abc.def.ghi",
        url: "https://provider.invalid/file?token=download-secret&safe=yes",
      },
    };

    const sanitized = JSON.stringify(redactForLog(fixture));
    expect(sanitized).not.toContain("person@example.com");
    expect(sanitized).not.toContain("firebase-user-123");
    expect(sanitized).not.toContain("peanuts");
    expect(sanitized).not.toContain("diabetes");
    expect(sanitized).not.toContain("top-secret-token");
    expect(sanitized).not.toContain("download-secret");
    expect(sanitized).toMatchInlineSnapshot(
      `"{\"authorization\":\"[REDACTED]\",\"email\":\"[REDACTED]\",\"uid\":\"[REDACTED]\",\"profile\":\"[REDACTED]\",\"providerBody\":\"[REDACTED]\",\"nested\":{\"message\":\"contact [REDACTED] using [REDACTED]\",\"url\":\"https://provider.invalid/file?token=[REDACTED]&safe=yes\"}}"`
    );
  });

  it("accepts only bounded safe correlation identifiers", () => {
    expect(getRequestId(new Request("https://example.test", { headers: { "x-request-id": "trace_12345678" } })))
      .toBe("trace_12345678");
    expect(getRequestId(new Request("https://example.test", { headers: { "x-request-id": "bad id with spaces" } })))
      .not.toBe("bad id with spaces");
  });
});
