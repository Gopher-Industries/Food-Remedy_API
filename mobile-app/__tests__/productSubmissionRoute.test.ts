jest.mock("@/server/firebaseAdmin", () => ({
  getAdminAuth: jest.fn(() => {
    throw new Error("service account secret must not be exposed");
  }),
  getAdminFirestore: jest.fn(),
}));

import { POST } from "@/app/api/product-submissions/+api";

describe("product-submission route startup failures", () => {
  it("sanitizes an unavailable server credential configuration", async () => {
    const response = await POST(
      new Request("http://localhost/api/product-submissions", { method: "POST" })
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      version: "v1",
      error: {
        code: "SUBMISSION_UNAVAILABLE",
        message: "Product submissions are temporarily unavailable. Please try again.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("service account secret");
  });
});
