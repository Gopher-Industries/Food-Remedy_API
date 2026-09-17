import {
  createDeletionRequestHandler,
  type DeletionRequestRecord,
  type DeletionRequestStore,
} from "../app/api/account-deletion/+api";

const NOW = 1_800_000_000;
const UID = "verified-user-123";

function request(options: { token?: string; body?: unknown; url?: string } = {}): Request {
  return new Request(options.url ?? "https://example.test/account-deletion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(options.body ?? {}),
  });
}

function record(state: DeletionRequestRecord["state"] = "accepted"): DeletionRequestRecord {
  return { requestId: "opaque-request-123", uid: UID, state };
}

function setup(verifyIdToken: jest.Mock, store: DeletionRequestStore) {
  return createDeletionRequestHandler({
    verifyIdToken,
    store,
    now: () => NOW,
  });
}

describe("BE047 account deletion request API", () => {
  it("accepts a recent authenticated token and persists the verified UID", async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      uid: UID,
      auth_time: NOW - 30,
    });
    const createOrGet = jest.fn().mockResolvedValue({ record: record(), created: true });
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(request({ token: "valid-token" }));

    expect(response.status).toBe(201);
    expect(verifyIdToken).toHaveBeenCalledWith("valid-token");
    expect(createOrGet).toHaveBeenCalledWith(UID);
    await expect(response.json()).resolves.toEqual({
      requestId: "opaque-request-123",
      state: "accepted",
      accepted: true,
      duplicate: false,
    });
  });

  it.each([
    ["missing token", undefined],
    ["invalid token", "invalid-token"],
    ["expired token", "expired-token"],
    ["revoked token", "revoked-token"],
  ])("rejects %s", async (_label, token) => {
    const verifyIdToken = jest.fn();
    if (token) verifyIdToken.mockRejectedValue(new Error(_label));
    const createOrGet = jest.fn();
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(request(token ? { token } : {}));

    expect(response.status).toBe(401);
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it("rejects authentication that is too old", async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      uid: UID,
      auth_time: NOW - 15 * 60 - 1,
    });
    const createOrGet = jest.fn();
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(request({ token: "stale-token" }));

    expect(response.status).toBe(403);
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it.each([
    "https://example.test/account-deletion?uid=another-user",
    "https://example.test/account-deletion?userId=another-user",
  ])("rejects UID selectors in the query string: %s", async (url) => {
    const verifyIdToken = jest.fn();
    const createOrGet = jest.fn();
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(request({ token: "valid-token", url }));

    expect(response.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it("rejects a UID selector in the request body", async () => {
    const verifyIdToken = jest.fn();
    const createOrGet = jest.fn();
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(
      request({ token: "valid-token", body: { uid: "another-user" } }),
    );

    expect(response.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it("returns the same logical operation for duplicate requests", async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: UID, auth_time: NOW });
    const createOrGet = jest
      .fn()
      .mockResolvedValueOnce({ record: record(), created: true })
      .mockResolvedValueOnce({ record: record(), created: false });
    const handler = setup(verifyIdToken, { createOrGet });

    const first = await handler(request({ token: "valid-token" }));
    const second = await handler(request({ token: "valid-token" }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({
      requestId: "opaque-request-123",
      state: "accepted",
      accepted: true,
      duplicate: true,
    });
    expect(createOrGet).toHaveBeenNthCalledWith(1, UID);
    expect(createOrGet).toHaveBeenNthCalledWith(2, UID);
  });

  it("does not return acceptance until durable persistence succeeds", async () => {
    let persisted = false;
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: UID, auth_time: NOW });
    const createOrGet = jest.fn().mockImplementation(async () => {
      persisted = true;
      return { record: record(), created: true };
    });
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(request({ token: "valid-token" }));

    expect(persisted).toBe(true);
    expect(response.status).toBe(201);
  });

  it.each<DeletionRequestRecord["state"]>([
    "accepted",
    "in-progress",
    "completed",
    "retryable-failure",
  ])("supports the %s request state", async (state) => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: UID, auth_time: NOW });
    const createOrGet = jest.fn().mockResolvedValue({ record: record(state), created: false });
    const handler = setup(verifyIdToken, { createOrGet });

    const response = await handler(request({ token: "valid-token" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "opaque-request-123",
      state,
      accepted: true,
      duplicate: true,
    });
  });
});