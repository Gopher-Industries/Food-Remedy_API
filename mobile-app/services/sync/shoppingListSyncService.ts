// Shopping List Replay & Sync Service
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getPendingOutboxOperations,
  updateOutboxOperationState,
  clearCompletedOutboxOperations,
  OutboxItem,
} from './shoppingListOutbox';
import {
  createShoppingListFirestore,
  updateShoppingListFirestore,
  deleteShoppingListFirestore,
  addItemToListFirestore,
  updateItemQuantityFirestore,
  updateItemNoteFirestore,
  toggleItemCheckedFirestore,
  removeItemFromListFirestore,
  clearCheckedItemsFirestore,
  clearAllItemsFirestore,
} from '@/services/database/user/shoppingLists';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

const MAX_ATTEMPTS = 5;
let isDraining = false;

/**
 * Replays queued outbox operations sequentially for a specific authenticated user.
 * Isolated strictly by userId. Idempotent.
 */
export async function drainOutbox(
  db: SQLiteDatabase,
  userId: string
): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (!db || !userId) return { processed: 0, succeeded: 0, failed: 0 };
  if (isDraining) return { processed: 0, succeeded: 0, failed: 0 };

  isDraining = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const pendingOps = await getPendingOutboxOperations(db, userId, MAX_ATTEMPTS);
    if (pendingOps.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    for (const op of pendingOps) {
      // Re-verify UID isolation per operation
      if (op.userId !== userId) {
        console.warn(`[OutboxReplay] Skipping operation ${op.outboxId} - UID mismatch (${op.userId} vs ${userId})`);
        continue;
      }

      processed++;
      const currentAttempts = op.attempts + 1;

      try {
        await executeOperationInFirestore(userId, op);
        await updateOutboxOperationState(db, op.outboxId, 'completed', currentAttempts);
        succeeded++;
      } catch (err) {
        console.warn(`[OutboxReplay] Operation ${op.outboxId} (${op.operationType}) failed (attempt ${currentAttempts}):`, err);
        failed++;
        const nextState = currentAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await updateOutboxOperationState(db, op.outboxId, nextState, currentAttempts);
      }
    }

    // Clean up completed outbox entries for user
    await clearCompletedOutboxOperations(db, userId);
  } finally {
    isDraining = false;
  }

  return { processed, succeeded, failed };
}

/**
 * Execute a single operation against Firestore
 */
async function executeOperationInFirestore(userId: string, op: OutboxItem): Promise<void> {
  const { operationType, payload } = op;

  switch (operationType) {
    case 'CREATE_LIST':
      await createShoppingListFirestore(userId, payload);
      break;
    case 'UPDATE_LIST':
      await updateShoppingListFirestore(userId, payload.listId, payload.updates);
      break;
    case 'DELETE_LIST':
      await deleteShoppingListFirestore(userId, payload.listId);
      break;
    case 'ADD_ITEM':
      await addItemToListFirestore(userId, payload.listId, payload.product, payload.quantity, payload.note);
      break;
    case 'UPDATE_QTY':
      await updateItemQuantityFirestore(userId, payload.listId, payload.barcode, payload.quantity);
      break;
    case 'UPDATE_NOTE':
      await updateItemNoteFirestore(userId, payload.listId, payload.barcode, payload.note);
      break;
    case 'TOGGLE_CHECKED':
      await toggleItemCheckedFirestore(userId, payload.listId, payload.barcode);
      break;
    case 'REMOVE_ITEM':
      await removeItemFromListFirestore(userId, payload.listId, payload.barcode);
      break;
    case 'CLEAR_CHECKED':
      await clearCheckedItemsFirestore(userId, payload.listId);
      break;
    case 'CLEAR_ALL':
      await clearAllItemsFirestore(userId, payload.listId);
      break;
    default:
      console.warn(`[OutboxReplay] Unknown operation type: ${operationType}`);
  }
}

/**
 * Setup global event triggers (reconnect and foreground) for automatic outbox replay
 */
export function setupAutoReplayTriggers(
  getDb: () => SQLiteDatabase | null,
  getUserId: () => string | null
): () => void {
  // Reconnect listener
  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      const db = getDb();
      const userId = getUserId();
      if (db && userId) {
        drainOutbox(db, userId).catch((e) =>
          console.warn('[OutboxReplay] Reconnect replay failed:', e)
        );
      }
    }
  });

  // App foreground listener
  const subscriptionAppState = AppState.addEventListener(
    'change',
    (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const db = getDb();
        const userId = getUserId();
        if (db && userId) {
          drainOutbox(db, userId).catch((e) =>
            console.warn('[OutboxReplay] Foreground replay failed:', e)
          );
        }
      }
    }
  );

  return () => {
    unsubscribeNetInfo();
    subscriptionAppState.remove();
  };
}
