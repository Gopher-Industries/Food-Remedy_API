import {
  enqueueShoppingListOperation,
  getPendingShoppingListOperations,
  removeShoppingListOperation,
  markShoppingListOperationFailed,
  markShoppingListOperationPending,
  getShoppingListSyncState,
} from "@/services/sync/shoppingListOutbox";

describe("shoppingListOutbox", () => {
  const runAsync = jest.fn();
  const getAllAsync = jest.fn();

  const db = {
    runAsync,
    getAllAsync,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queues a shopping list operation in the local outbox", async () => {
    runAsync.mockResolvedValue(undefined);

    await enqueueShoppingListOperation(db, {
      userId: "user-1",
      listId: "list-1",
      barcode: "12345",
      operationType: "UPSERT_ITEM",
      payload: { quantity: 2 },
      revision: 1,
    });

    expect(runAsync).toHaveBeenCalled();
    expect(runAsync.mock.calls[0][0]).toContain(
    "INSERT OR IGNORE INTO shopping_list_outbox"
    );
  });

  it("returns pending and failed operations for replay", async () => {
    getAllAsync.mockResolvedValue([
      {
        operation_id: "operation-1",
        user_id: "user-1",
        list_id: "list-1",
        barcode: "12345",
        operation_type: "UPSERT_ITEM",
        payload_json: JSON.stringify({ quantity: 2 }),
        revision: 1,
        created_at: "2026-09-07T00:00:00.000Z",
        updated_at: "2026-09-07T00:00:00.000Z",
        retry_count: 0,
        status: "pending",
      },
    ]);

    const operations = await getPendingShoppingListOperations(db);

    expect(getAllAsync).toHaveBeenCalled();
    expect(getAllAsync.mock.calls[0][0]).toContain(
      "WHERE status IN ('pending', 'failed')"
    );
    expect(operations).toHaveLength(1);
    expect(operations[0].operationType).toBe("UPSERT_ITEM");
  });

  it("removes an operation after successful synchronization", async () => {
    runAsync.mockResolvedValue(undefined);

    await removeShoppingListOperation(db, "operation-1");

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM shopping_list_outbox"),
      ["operation-1"]
    );
  });

  it("marks an operation as failed when synchronization fails", async () => {
    runAsync.mockResolvedValue(undefined);

    await markShoppingListOperationFailed(db, "operation-1");

    expect(runAsync).toHaveBeenCalled();
    expect(runAsync.mock.calls[0][0]).toContain("status = 'failed'");
  });

  it("allows a failed operation to be marked pending for retry", async () => {
    runAsync.mockResolvedValue(undefined);

    await markShoppingListOperationPending(db, "operation-1");

    expect(runAsync).toHaveBeenCalled();
    expect(runAsync.mock.calls[0][0]).toContain("status = 'pending'");
  });

  it("reports synced when there are no queued operations", async () => {
    getAllAsync.mockResolvedValue([]);

    const state = await getShoppingListSyncState(db);

    expect(state).toEqual({
      state: "synced",
      pendingCount: 0,
      failedCount: 0,
    });
  });

  it("reports pending when operations are waiting to sync", async () => {
    getAllAsync.mockResolvedValue([
      {
        status: "pending",
        count: 2,
      },
    ]);

    const state = await getShoppingListSyncState(db);

    expect(state).toEqual({
      state: "pending",
      pendingCount: 2,
      failedCount: 0,
    });
  });

  it("reports failed when an operation has failed to sync", async () => {
    getAllAsync.mockResolvedValue([
      {
        status: "failed",
        count: 1,
      },
    ]);

    const state = await getShoppingListSyncState(db);

    expect(state).toEqual({
      state: "failed",
      pendingCount: 0,
      failedCount: 1,
    });
  });
});