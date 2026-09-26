import type { SQLiteDatabase } from "expo-sqlite";

import type {
  ShoppingList,
  ShoppingListItem,
} from "@/types/ShoppingList";

import {
  createShoppingListFirestore,
  updateShoppingListFirestore,
  deleteShoppingListFirestore,
  upsertItemInListFirestore,
  removeItemFromListFirestore,
  clearCheckedItemsFirestore,
  clearAllItemsFirestore,
} from "@/services/database/user/shoppingLists";

import {
  getPendingShoppingListOperations,
  markShoppingListOperationFailed,
  markShoppingListOperationPending,
  removeShoppingListOperation,
  type ShoppingListOutboxOperation,
} from "./shoppingListOutbox";

/**
 * Result returned after attempting to flush the shopping-list outbox.
 */
export interface ShoppingListFlushResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Replay one persisted shopping-list operation against Firestore.
 *
 * Replay is designed to be idempotent:
 * - list creation uses Firestore set/upsert behaviour
 * - item writes use upsertItemInListFirestore
 * - deletes can safely be repeated
 * - clear operations can safely be repeated
 */
async function replayShoppingListOperation(
  operation: ShoppingListOutboxOperation
): Promise<void> {
  switch (operation.operationType) {
    case "CREATE_LIST": {
      const list = operation.payload as ShoppingList | null;

      if (!list) {
        throw new Error("CREATE_LIST operation is missing its payload");
      }

      await createShoppingListFirestore(
        operation.userId,
        list
      );

      return;
    }

    case "UPDATE_LIST": {
      const updates = operation.payload as {
        listName?: string;
        color?: string;
        emoji?: string;
      } | null;

      if (!updates) {
        throw new Error("UPDATE_LIST operation is missing its payload");
      }

      await updateShoppingListFirestore(
        operation.userId,
        operation.listId,
        updates
      );

      return;
    }

    case "DELETE_LIST": {
      await deleteShoppingListFirestore(
        operation.userId,
        operation.listId
      );

      return;
    }

    case "UPSERT_ITEM": {
      const item = operation.payload as ShoppingListItem | null;

      if (!item) {
        throw new Error("UPSERT_ITEM operation is missing its payload");
      }

      await upsertItemInListFirestore(
        operation.userId,
        operation.listId,
        item
      );

      return;
    }

    case "DELETE_ITEM": {
      if (!operation.barcode) {
        throw new Error("DELETE_ITEM operation is missing its barcode");
      }

      await removeItemFromListFirestore(
        operation.userId,
        operation.listId,
        operation.barcode
      );

      return;
    }

    case "CLEAR_CHECKED": {
      await clearCheckedItemsFirestore(
        operation.userId,
        operation.listId
      );

      return;
    }

    case "CLEAR_ALL": {
      await clearAllItemsFirestore(
        operation.userId,
        operation.listId
      );

      return;
    }

    default: {
      const exhaustiveCheck: never = operation.operationType;
      throw new Error(
        `Unsupported shopping-list operation: ${exhaustiveCheck}`
      );
    }
  }
}

/**
 * Flush all persisted shopping-list operations.
 *
 * Operations are returned by the outbox in deterministic revision order.
 *
 * Successful operations are removed only after Firestore completes.
 * Failed operations remain persisted so they survive app restart and
 * can be retried on the next reconnect / foreground event.
 */
export async function flushShoppingListOutbox(
  db: SQLiteDatabase
): Promise<ShoppingListFlushResult> {
  const operations = await getPendingShoppingListOperations(db);

  const result: ShoppingListFlushResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  };

  for (const operation of operations) {
    result.attempted += 1;

    try {
      await markShoppingListOperationPending(
        db,
        operation.operationId
      );

      await replayShoppingListOperation(operation);

      await removeShoppingListOperation(
        db,
        operation.operationId
      );

      result.succeeded += 1;
    } catch (error) {
      await markShoppingListOperationFailed(
        db,
        operation.operationId
      );

      result.failed += 1;

      console.warn(
        "[ShoppingListSync] Failed to replay operation:",
        {
          operationId: operation.operationId,
          operationType: operation.operationType,
          listId: operation.listId,
          retryCount: operation.retryCount + 1,
        },
        error
      );
    }
  }

  return result;
}