import type { SQLiteDatabase } from "expo-sqlite";

export type ShoppingListOutboxOperationType =
  | "CREATE_LIST"
  | "UPDATE_LIST"
  | "DELETE_LIST"
  | "UPSERT_ITEM"
  | "DELETE_ITEM"
  | "CLEAR_CHECKED"
  | "CLEAR_ALL";

export type ShoppingListSyncStatus = "pending" | "failed";

export interface ShoppingListOutboxOperation {
  operationId: string;
  userId: string;
  listId: string;
  barcode: string | null;
  operationType: ShoppingListOutboxOperationType;
  payload: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  status: ShoppingListSyncStatus;
}

interface ShoppingListOutboxRow {
  operation_id: string;
  user_id: string;
  list_id: string;
  barcode: string | null;
  operation_type: ShoppingListOutboxOperationType;
  payload_json: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  retry_count: number;
  status: ShoppingListSyncStatus;
}

function createOperationId(): string {
  return `shopping-list-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function mapRow(row: ShoppingListOutboxRow): ShoppingListOutboxOperation {
  let payload: unknown = null;

  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = null;
    }
  }

  return {
    operationId: row.operation_id,
    userId: row.user_id,
    listId: row.list_id,
    barcode: row.barcode,
    operationType: row.operation_type,
    payload,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retryCount: row.retry_count,
    status: row.status,
  };
}

/**
 * Persist a shopping-list operation locally before cloud sync.
 *
 * The operation ID is stable for the lifetime of the queued operation,
 * allowing retries to replay the same operation rather than creating
 * duplicate outbox entries.
 */
export async function enqueueShoppingListOperation(
  db: SQLiteDatabase,
  input: {
    userId: string;
    listId: string;
    barcode?: string | null;
    operationType: ShoppingListOutboxOperationType;
    payload?: unknown;
    revision?: number;
    operationId?: string;
  }
): Promise<ShoppingListOutboxOperation> {
  const now = new Date().toISOString();
  const operationId = input.operationId ?? createOperationId();
  const revision = input.revision ?? Date.now();

  await db.runAsync(
    `INSERT OR IGNORE INTO shopping_list_outbox (
      operation_id,
      user_id,
      list_id,
      barcode,
      operation_type,
      payload_json,
      revision,
      created_at,
      updated_at,
      retry_count,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
    [
      operationId,
      input.userId,
      input.listId,
      input.barcode ?? null,
      input.operationType,
      input.payload === undefined ? null : JSON.stringify(input.payload),
      revision,
      now,
      now,
    ]
  );

  return {
    operationId,
    userId: input.userId,
    listId: input.listId,
    barcode: input.barcode ?? null,
    operationType: input.operationType,
    payload: input.payload ?? null,
    revision,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    status: "pending",
  };
}

/**
 * Return operations that still require synchronization.
 *
 * Operations are replayed in deterministic order:
 * revision first, then creation time, then operation ID.
 */
export async function getPendingShoppingListOperations(
  db: SQLiteDatabase
): Promise<ShoppingListOutboxOperation[]> {
  const rows = await db.getAllAsync<ShoppingListOutboxRow>(
    `SELECT *
     FROM shopping_list_outbox
     WHERE status IN ('pending', 'failed')
     ORDER BY revision ASC, created_at ASC, operation_id ASC`
  );

  return rows.map(mapRow);
}

/**
 * Remove an operation only after the cloud write has completed
 * successfully.
 */
export async function removeShoppingListOperation(
  db: SQLiteDatabase,
  operationId: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM shopping_list_outbox
     WHERE operation_id = ?`,
    [operationId]
  );
}

/**
 * Record a failed synchronization attempt.
 *
 * The operation remains in SQLite so that it survives application
 * restarts and can be retried later.
 */
export async function markShoppingListOperationFailed(
  db: SQLiteDatabase,
  operationId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE shopping_list_outbox
     SET status = 'failed',
         retry_count = retry_count + 1,
         updated_at = ?
     WHERE operation_id = ?`,
    [now, operationId]
  );
}

/**
 * Move a failed operation back into the pending state before another
 * synchronization attempt.
 */
export async function markShoppingListOperationPending(
  db: SQLiteDatabase,
  operationId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE shopping_list_outbox
     SET status = 'pending',
         updated_at = ?
     WHERE operation_id = ?`,
    [now, operationId]
  );
}

/**
 * Return a stable summary that the frontend can use to display
 * shopping-list synchronization state.
 */
export async function getShoppingListSyncState(
  db: SQLiteDatabase
): Promise<{
  state: "synced" | "pending" | "failed";
  pendingCount: number;
  failedCount: number;
}> {
  const rows = await db.getAllAsync<{
    status: ShoppingListSyncStatus;
    count: number;
  }>(
    `SELECT status, COUNT(*) AS count
     FROM shopping_list_outbox
     GROUP BY status`
  );

  let pendingCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    if (row.status === "pending") {
      pendingCount = row.count;
    }

    if (row.status === "failed") {
      failedCount = row.count;
    }
  }

  return {
    state:
      failedCount > 0
        ? "failed"
        : pendingCount > 0
          ? "pending"
          : "synced",
    pendingCount,
    failedCount,
  };
}