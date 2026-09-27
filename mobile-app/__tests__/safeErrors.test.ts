import {
  logSafeError,
  redactSensitive,
} from "@/services/backend/safeErrors";

const leakageSamples = [
  "secret.person@example.com",
  "https://firebasestorage.googleapis.com/v0/b/private-bucket/o/avatar.jpg?token=fake-token",
  "bucket=secret-bucket.appspot.com",
  "uid=firebase-user-abc123",
  "Firebase fake-auth-token-1234567890",
  "at handler (/app/api/private.ts:12:34)",
  "body={\"provider\":\"raw response body\"}",
  "profileHealth=high-risk-medical-value",
];

function expectNoSensitiveLeak(text: string): void {
  expect(text).not.toMatch(/\btoken=[^\s]+/i);
  expect(text).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  expect(text).not.toMatch(/https?:\/\//i);
  expect(text).not.toMatch(/at\s+.+\(.+:\d+:\d+\)/);

  for (const sample of leakageSamples) {
    expect(text).not.toContain(sample);
  }
}

describe("safe error redaction", () => {
  it("redacts sensitive provider and request details from logs", () => {
    const raw = new Error(leakageSamples.join(" "));

    const redacted = redactSensitive(raw);

    expect(redacted).toBe("Error");
    expectNoSensitiveLeak(redacted);
  });

  it("drops arbitrary error names, codes, and object fields", () => {
    const raw = new Error("provider secret");
    raw.name = "secret.person@example.com";
    (raw as Error & { code: string }).code = "token=private-value";

    expect(redactSensitive(raw)).toBe("Error");
    expect(redactSensitive({ arbitraryField: "medical notes" })).toBe("[REDACTED]");
    expect(redactSensitive("raw provider response")).toBe("[REDACTED]");
  });

  it("logs sanitized errors instead of raw thrown values", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    logSafeError("Provider failed:", {
      message: leakageSamples.join(" "),
      email: "secret.person@example.com",
    });

    const logged = spy.mock.calls.flat().join(" ");

    expect(logged).toContain("Provider failed:");
    expectNoSensitiveLeak(logged);

    spy.mockRestore();
  });

  it("proves the redaction gate fails for an intentional token leak", () => {
    const intentionalLeak = "debug token=fake-token";

    expect(() => expectNoSensitiveLeak(intentionalLeak)).toThrow();
  });
});
