// Shopping List Outbox DAO & Helper
import type { SQLiteDatabase } from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';

export type OutboxOperationType =
  | 'CREATE_LIST'
  | 'UPDATE_LIST'
  | 'DELETE_LIST'
  | 'ADD_ITEM'
  | 'UPDATE_QTY'
  | 'UPDATE_NOTE'
  | 'TOGGLE_CHECKED'
  | 'REMOVE_ITEM'
  | 'CLEAR_CHECKED'
  | 'CLEAR_ALL';

export type OutboxState = 'pending' | 'failed' | 'completed';

export interface OutboxItem {
  outboxId: string;
  userId: string;
  operationType: OutboxOperationType;
  payload: any;
  attempts: number;
  state: OutboxState;
  createdAt: string;
  updatedAt: string;
}

const nowIso = () => new Date().toISOString();

/**
 * Queue a new operation into the outbox
 */
export async function queueOutboxOperation(
  db: SQLiteDatabase,
  userId: string,
  operationType: OutboxOperationType,
  payload: any
): Promise<OutboxItem> {
  const outboxId = uuidv4();
  const now = nowIso();
  const payloadJson = JSON.stringify(payload ?? {});

  await db.runAsync(
    `INSERT INTO shopping_list_outbox (outbox_id, user_id, operation_type, payload_json, attempts, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [outboxId, userId, operationType, payloadJson, 0, 'pending', now, now]
  );

  return {
    outboxId,
    userId,
    operationType,
    payload,
    attempts: 0,
    state: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve pending operations for a specific user ID ordered deterministically by created_at ASC
 */
export async function getPendingOutboxOperations(
  db: SQLiteDatabase,
  userId: string,
  maxAttempts: number = 5
): Promise<OutboxItem[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT outbox_id, user_id, operation_type, payload_json, attempts, state, created_at, updated_at
     FROM shopping_list_outbox
     WHERE user_id = ? AND state IN ('pending', 'failed') AND attempts < ?
     ORDER BY created_at ASC, outbox_id ASC`,
    [userId, maxAttempts]
  );

  return rows.map((r) => {
    let payload = {};
    try {
      payload = JSON.parse(r.payload_json);
    } catch {
      payload = {};
    }
    return {
      outboxId: r.outbox_id,
      userId: r.user_id,
      operationType: r.operation_type as OutboxOperationType,
      payload,
      attempts: Number(r.attempts) || 0,
      state: r.state as OutboxState,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/**
 * Retrieve all operations in outbox for a specific user ID (for inspection/testing)
 */
export async function getAllOutboxOperations(
  db: SQLiteDatabase,
  userId: string
): Promise<OutboxItem[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT outbox_id, user_id, operation_type, payload_json, attempts, state, created_at, updated_at
     FROM shopping_list_outbox
     WHERE user_id = ?
     ORDER BY created_at ASC, outbox_id ASC`,
    [userId]
  );

  return rows.map((r) => {
    let payload = {};
    try {
      payload = JSON.parse(r.payload_json);
    } catch {
      payload = {};
    }
    return {
      outboxId: r.outbox_id,
      userId: r.user_id,
      operationType: r.operation_type as OutboxOperationType,
      payload,
      attempts: Number(r.attempts) || 0,
      state: r.state as OutboxState,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/**
 * Update state and attempt count of an outbox operation
 */
export async function updateOutboxOperationState(
  db: SQLiteDatabase,
  outboxId: string,
  state: OutboxState,
  attempts?: number
): Promise<void> {
  const now = nowIso();
  if (attempts !== undefined) {
    await db.runAsync(
      `UPDATE shopping_list_outbox SET state = ?, attempts = ?, updated_at = ? WHERE outbox_id = ?`,
      [state, attempts, now, outboxId]
    );
  } else {
    await db.runAsync(
      `UPDATE shopping_list_outbox SET state = ?, updated_at = ? WHERE outbox_id = ?`,
      [state, now, outboxId]
    );
  }
}

/**
 * Delete a specific operation from the outbox
 */
export async function deleteOutboxOperation(
  db: SQLiteDatabase,
  outboxId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM shopping_list_outbox WHERE outbox_id = ?`, [outboxId]);
}

/**
 * Clear all completed operations from outbox for a user
 */
export async function clearCompletedOutboxOperations(
  db: SQLiteDatabase,
  userId: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM shopping_list_outbox WHERE user_id = ? AND state = 'completed'`,
    [userId]
  );
}
