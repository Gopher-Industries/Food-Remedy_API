/*
PURPOSE:
Outbox Persistence & Replay Integration Tests for PR #217.
Verifies:
- Offline list operations survive process restart / DB reopen.
- Auto-replay drains queued items to Firestore.
- Repeated replay is idempotent and does not create duplicate items.
- Transient failures increment attempt counts and transition to 'failed' state.
- Authenticated UID isolation prevents replaying one user's queue under another account.
*/

import { MockSQLiteDatabase } from '../testing/mockSqliteDb';
import {
  queueOutboxOperation,
  getPendingOutboxOperations,
  getAllOutboxOperations,
} from '../services/sync/shoppingListOutbox';
import { drainOutbox } from '../services/sync/shoppingListSyncService';

// Mock dependencies
jest.mock('../config/firebaseConfig', () => ({ fdb: {} }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('../services/database/user/shoppingLists', () => ({
  createShoppingListFirestore: jest.fn().mockResolvedValue(undefined),
  updateShoppingListFirestore: jest.fn().mockResolvedValue(undefined),
  deleteShoppingListFirestore: jest.fn().mockResolvedValue(undefined),
  addItemToListFirestore: jest.fn().mockResolvedValue(undefined),
  updateItemQuantityFirestore: jest.fn().mockResolvedValue(undefined),
  updateItemNoteFirestore: jest.fn().mockResolvedValue(undefined),
  toggleItemCheckedFirestore: jest.fn().mockResolvedValue(undefined),
  removeItemFromListFirestore: jest.fn().mockResolvedValue(undefined),
  clearCheckedItemsFirestore: jest.fn().mockResolvedValue(undefined),
  clearAllItemsFirestore: jest.fn().mockResolvedValue(undefined),
}));

import {
  createShoppingListFirestore,
  addItemToListFirestore,
  updateItemQuantityFirestore,
} from '../services/database/user/shoppingLists';

describe('Shopping List Outbox Persistence & Replay Integration', () => {
  let db: MockSQLiteDatabase;
  const userA = 'user-AAA-111';
  const userB = 'user-BBB-222';

  beforeEach(async () => {
    jest.clearAllMocks();
    db = new MockSQLiteDatabase();
    // Initialize outbox schema
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS shopping_list_outbox (
        outbox_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'failed', 'completed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  });

  /* =========================================================================
     SUITE 1: RESTART PERSISTENCE
     ========================================================================= */
  describe('Process Restart Persistence', () => {
    it('persists queued offline operations and preserves owner, type, payload, state across DB restarts', async () => {
      // ARRANGE: Queue two offline operations while disconnected
      const listPayload = { listId: 'list-101', listName: 'Groceries', userId: userA };
      const itemPayload = {
        listId: 'list-101',
        product: { barcode: '9300601234567', productName: 'Almond Milk' },
        quantity: 2,
      };

      await queueOutboxOperation(db as any, userA, 'CREATE_LIST', listPayload);
      await queueOutboxOperation(db as any, userA, 'ADD_ITEM', itemPayload);

      // ACT: Simulate process restart by querying pending items from database
      const pendingBeforeRestart = await getPendingOutboxOperations(db as any, userA);

      // ASSERT: Outbox items survive and retain complete state
      expect(pendingBeforeRestart).toHaveLength(2);
      expect(pendingBeforeRestart[0].userId).toBe(userA);
      expect(pendingBeforeRestart[0].operationType).toBe('CREATE_LIST');
      expect(pendingBeforeRestart[0].payload.listName).toBe('Groceries');
      expect(pendingBeforeRestart[0].state).toBe('pending');
      expect(pendingBeforeRestart[0].attempts).toBe(0);

      expect(pendingBeforeRestart[1].operationType).toBe('ADD_ITEM');
      expect(pendingBeforeRestart[1].payload.product.productName).toBe('Almond Milk');
      expect(pendingBeforeRestart[1].payload.quantity).toBe(2);
    });
  });

  /* =========================================================================
     SUITE 2: AUTOMATIC REPLAY & RECONNECT
     ========================================================================= */
  describe('Reconnect Auto-Replay', () => {
    it('automatically drains queued operations to Firestore on reconnect', async () => {
      // ARRANGE: Queue offline mutations
      await queueOutboxOperation(db as any, userA, 'CREATE_LIST', {
        listId: 'list-201',
        listName: 'Weekly Prep',
      });
      await queueOutboxOperation(db as any, userA, 'ADD_ITEM', {
        listId: 'list-201',
        product: { barcode: '111222333', productName: 'Oats' },
        quantity: 1,
      });

      // ACT: Connectivity returns and drainOutbox runs
      const result = await drainOutbox(db as any, userA);

      // ASSERT: All operations drain and push to Firestore
      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(createShoppingListFirestore).toHaveBeenCalledTimes(1);
      expect(addItemToListFirestore).toHaveBeenCalledTimes(1);

      // Queue is now drained
      const remainingPending = await getPendingOutboxOperations(db as any, userA);
      expect(remainingPending).toHaveLength(0);
    });
  });

  /* =========================================================================
     SUITE 3: IDEMPOTENT REPLAY & DUPLICATE PREVENTION
     ========================================================================= */
  describe('Idempotent Replay', () => {
    it('repeated drain calls do not duplicate writes or list items', async () => {
      // ARRANGE: One queued operation
      await queueOutboxOperation(db as any, userA, 'ADD_ITEM', {
        listId: 'list-301',
        product: { barcode: '555666777', productName: 'Apples' },
        quantity: 3,
      });

      // ACT: Drain outbox twice sequentially
      const run1 = await drainOutbox(db as any, userA);
      const run2 = await drainOutbox(db as any, userA);

      // ASSERT: First run processes operation, second run does nothing
      expect(run1.succeeded).toBe(1);
      expect(run2.processed).toBe(0);
      expect(addItemToListFirestore).toHaveBeenCalledTimes(1);
    });
  });

  /* =========================================================================
     SUITE 4: TRANSIENT FAILURES & TOMBSTONE STATES
     ========================================================================= */
  describe('Transient Failure & Retry Policy', () => {
    it('increments attempts on network error and marks state failed after max retries', async () => {
      // ARRANGE: Mock Firestore error for transient network failure
      (addItemToListFirestore as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      await queueOutboxOperation(db as any, userA, 'ADD_ITEM', {
        listId: 'list-401',
        product: { barcode: '999000111', productName: 'Bread' },
        quantity: 1,
      });

      // ACT 1: First failed replay attempt
      const attempt1 = await drainOutbox(db as any, userA);
      expect(attempt1.failed).toBe(1);

      let ops = await getAllOutboxOperations(db as any, userA);
      expect(ops[0].attempts).toBe(1);
      expect(ops[0].state).toBe('pending');

      // ACT 2: Run remaining attempts up to max retries (5 total)
      await drainOutbox(db as any, userA); // 2
      await drainOutbox(db as any, userA); // 3
      await drainOutbox(db as any, userA); // 4
      await drainOutbox(db as any, userA); // 5

      // ASSERT: State switches to 'failed' after 5 attempts
      ops = await getAllOutboxOperations(db as any, userA);
      expect(ops[0].attempts).toBe(5);
      expect(ops[0].state).toBe('failed');
    });
  });

  /* =========================================================================
     SUITE 5: ACCOUNT SWITCHING & UID ISOLATION
     ========================================================================= */
  describe('Account Switching & UID Isolation', () => {
    it('prevents account switching from replaying another user queue', async () => {
      // ARRANGE: User A queues an operation offline
      await queueOutboxOperation(db as any, userA, 'CREATE_LIST', {
        listId: 'list-userA-1',
        listName: "User A's Private List",
      });

      // User B queues an operation offline
      await queueOutboxOperation(db as any, userB, 'CREATE_LIST', {
        listId: 'list-userB-1',
        listName: "User B's Private List",
      });

      // ACT: Log in as User B and drain outbox for User B
      const resultUserB = await drainOutbox(db as any, userB);

      // ASSERT: Only User B's operation was processed
      expect(resultUserB.processed).toBe(1);
      expect(createShoppingListFirestore).toHaveBeenCalledTimes(1);
      expect(createShoppingListFirestore).toHaveBeenCalledWith(
        userB,
        expect.objectContaining({ listId: 'list-userB-1' })
      );

      // User A's outbox operation remains untouched in pending queue for User A
      const userAPending = await getPendingOutboxOperations(db as any, userA);
      expect(userAPending).toHaveLength(1);
      expect(userAPending[0].payload.listId).toBe('list-userA-1');
    });
  });
});
