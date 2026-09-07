import {
  bumpHistory,
  clearHistory,
  deleteHistoryEntry,
  getAuthenticatedHistoryOwnerScope,
  getHistoryItem,
  GUEST_HISTORY_OWNER_SCOPE,
  listHistory,
  pruneHistory,
} from "@/services/sqlDatabase/history.dao";
import { getHistoryOwnerScope } from "@/services/session/historyOwnerScope";

function createMockDb() {
  return {
    runAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
  };
}

const product = {
  barcode: "9300000000001",
  productName: "Scoped Oats",
  brand: "Food Remedy",
};

describe("BE028 account-scoped product history", () => {
  it("builds account and guest history owner scopes", () => {
    expect(getAuthenticatedHistoryOwnerScope("user-a")).toBe("user:user-a");
    expect(getHistoryOwnerScope("authenticated", "user-a")).toBe("user:user-a");
    expect(getHistoryOwnerScope("guest", null)).toBe(GUEST_HISTORY_OWNER_SCOPE);
    expect(getHistoryOwnerScope("unauthenticated", null)).toBeNull();
    expect(getHistoryOwnerScope("restoring", null)).toBeNull();
  });

  it("writes history under the active owner scope", async () => {
    const db = createMockDb();

    await bumpHistory(db as any, "user:user-a", product as any);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT(owner_scope, barcode)"),
      expect.arrayContaining(["user:user-a", product.barcode])
    );
  });

  it("reads only the active account history", async () => {
    const db = createMockDb();

    await getHistoryItem(db as any, "user:user-b", product.barcode);
    await listHistory(db as any, "user:user-b", 20, 0);

    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE owner_scope=? AND barcode=?"),
      ["user:user-b", product.barcode]
    );
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE owner_scope=?"),
      ["user:user-b", 20, 0]
    );
  });

  it("deletes, clears, and prunes only the active owner scope", async () => {
    const db = createMockDb();

    await deleteHistoryEntry(db as any, "user:user-a", product.barcode);
    await clearHistory(db as any, "user:user-a");
    await pruneHistory(db as any, "user:user-a", 500);

    expect(db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE owner_scope=? AND barcode=?"),
      ["user:user-a", product.barcode]
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("WHERE owner_scope=?"),
      ["user:user-a"]
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("WHERE owner_scope=? AND barcode IN"),
      ["user:user-a", "user:user-a", 500]
    );
  });
});
