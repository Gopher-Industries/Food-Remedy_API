// Use Shopping List Hook

import { useCallback, useEffect, useRef, useState } from "react";
import { useSQLiteDatabase } from "@/components/providers/SQLiteDatabaseProvider";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import type { ShoppingList, ShoppingListItem } from "@/types/ShoppingList";
import type { Product } from "@/types/Product";
import {
  createShoppingListFirestore,
  getShoppingListsFirestore,
  getListItemsFirestore,
  updateShoppingListFirestore,
  deleteShoppingListFirestore,
  addItemToListFirestore,
  updateItemQuantityFirestore,
  updateItemNoteFirestore,
  toggleItemCheckedFirestore,
  removeItemFromListFirestore,
  clearCheckedItemsFirestore,
  clearAllItemsFirestore,
  upsertItemInListFirestore,
} from "@/services/database/user/shoppingLists";
import { auth } from "@/config/firebaseConfig";
import { signInAnonymously } from "firebase/auth";
import {
  createShoppingList,
  getShoppingLists,
  getShoppingList,
  updateShoppingList,
  deleteShoppingList,
  addItemToList,
  getListItems,
  updateItemQuantity,
  updateItemNote,
  toggleItemChecked,
  removeItemFromList,
  clearCheckedItems,
  clearAllItems,
  getListItemCount,
  getItemInList,
  upsertShoppingList,
  upsertListItem,
} from "@/services/sqlDatabase/shoppingList.dao";
import { queueOutboxOperation } from "@/services/sync/shoppingListOutbox";
import { drainOutbox } from "@/services/sync/shoppingListSyncService";

export function useShoppingList() {
  const { db, isDbReady } = useSQLiteDatabase();
  const userId = useAuthUserId();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [currentList, setCurrentList] = useState<ShoppingList | null>(null);
  const [currentItems, setCurrentItems] = useState<
    (ShoppingListItem & { product: Product })[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [hasSyncedFromCloud, setHasSyncedFromCloud] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  const ensureUid = useCallback(async (): Promise<string | null> => {
    if (userId) return userId;
    let uid = auth.currentUser?.uid ?? null;
    if (uid) return uid;
    try {
      const cred = await signInAnonymously(auth);
      uid = cred.user?.uid ?? null;
    } catch (e) {
      console.warn("Anonymous sign-in attempt failed:", e);
    }
    return uid;
  }, [userId]);

  /**
   * Refresh all shopping lists
   */
  const refreshLists = useCallback(async () => {
    if (!db || !isDbReady || !userId) return;
    setLoading(true);
    try {
      const allLists = await getShoppingLists(db, userId);
      setLists(allLists);
    } finally {
      setLoading(false);
    }
  }, [db, isDbReady, userId]);

  useEffect(() => {
    if (!db || !isDbReady || !userId) return;

    // Trigger outbox replay on startup/ready
    drainOutbox(db, userId).catch((e) =>
      console.warn("Outbox replay on startup failed:", e)
    );

    if (hasSyncedFromCloud) return;

    let cancelled = false;
    (async () => {
      try {
        const cloudLists = await getShoppingListsFirestore(userId);
        for (const list of cloudLists) {
          if (cancelled) return;
          await upsertShoppingList(db, { ...list, userId });
          const items = await getListItemsFirestore(userId, list.listId);
          for (const item of items) {
            if (cancelled) return;
            await upsertListItem(db, {
              ...item,
              listId: list.listId,
              productJson: item.productJson ?? JSON.stringify(item.product ?? null),
              isChecked: !!item.isChecked,
            });
          }
        }
        await refreshLists();
      } catch (e) {
        console.warn("Cloud sync (shopping lists) failed:", e);
      } finally {
        if (!cancelled) setHasSyncedFromCloud(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, isDbReady, userId, hasSyncedFromCloud, refreshLists]);

  useEffect(() => {
    if (userId === lastUserIdRef.current) return;
    lastUserIdRef.current = userId ?? null;
    setLists([]);
    setCurrentList(null);
    setCurrentItems([]);
    setHasSyncedFromCloud(false);
  }, [userId]);

  /**
   * Create a new shopping list
   */
  const createList = useCallback(
    async (listName: string, color?: string, emoji?: string) => {
      const uid = userId || (await ensureUid());
      if (!db || !uid) return null;
      const newList = await createShoppingList(db, uid, listName, color, emoji);
      
      // Queue outbox operation and drain outbox
      try {
        await queueOutboxOperation(db, uid, "CREATE_LIST", newList);
        drainOutbox(db, uid).catch((e) =>
          console.warn("Failed to drain outbox after createList:", e)
        );
      } catch (e) {
        console.warn("Failed to queue createList in outbox:", e);
      }

      setLists((prev) => [newList, ...prev]);
      return newList;
    },
    [db, userId, ensureUid]
  );

  /**
   * Update a shopping list
   */
  const updateList = useCallback(
    async (listId: string, updates: { listName?: string; color?: string; emoji?: string }) => {
      if (!db) return;
      await updateShoppingList(db, listId, updates);
      
      const uid = userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "UPDATE_LIST", { listId, updates });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after updateList:", e)
          );
        } catch (e) {
          console.warn("Failed to queue updateList in outbox:", e);
        }
      }

      setLists((prev) =>
        prev.map((list) =>
          list.listId === listId
            ? { ...list, ...updates, updatedAt: new Date().toISOString() }
            : list
        )
      );
      if (currentList?.listId === listId) {
        setCurrentList((prev) => (prev ? { ...prev, ...updates } : null));
      }
    },
    [db, currentList, userId, ensureUid]
  );

  /**
   * Delete a shopping list
   */
  const deleteList = useCallback(
    async (listId: string) => {
      if (!db) return;
      await deleteShoppingList(db, listId);
      
      const uid = userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "DELETE_LIST", { listId });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after deleteList:", e)
          );
        } catch (e) {
          console.warn("Failed to queue deleteList in outbox:", e);
        }
      }

      setLists((prev) => prev.filter((list) => list.listId !== listId));
      if (currentList?.listId === listId) {
        setCurrentList(null);
        setCurrentItems([]);
      }
    },
    [db, currentList, userId, ensureUid]
  );

  /**
   * Load a specific list
   */
  const loadList = useCallback(
    async (listId: string) => {
      if (!db) return;
      setLoading(true);
      try {
        const list = await getShoppingList(db, listId);
        setCurrentList(list);
        if (list) {
          const items = await getListItems(db, listId);
          setCurrentItems(items);
        }
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  /**
   * Add a product to a list
   */
  const addItem = useCallback(
    async (listId: string, product: Product, quantity: number = 1, note?: string) => {
      if (!db) {
        console.error('[useShoppingList] addItem called but db is not ready!', { listId, product: product.productName, quantity });
        throw new Error('Database not ready');
      }
      console.log('[useShoppingList] addItem called:', { listId, productName: product.productName, quantity, note });
      try {
        await addItemToList(db, listId, product, quantity, note);
        console.log('[useShoppingList] Successfully added item to database');
      } catch (err) {
        console.error('[useShoppingList] Failed to add item to database:', err);
        throw err;
      }

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "ADD_ITEM", { listId, product, quantity, note });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after addItem:", e)
          );
        } catch (e) {
          console.warn("Failed to queue addItem in outbox:", e);
        }
      }

      // If this is the current list, refresh items
      if (currentList?.listId === listId) {
        const items = await getListItems(db, listId);
        setCurrentItems(items);
      }
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Update item quantity
   */
  const updateQuantity = useCallback(
    async (listId: string, barcode: string, quantity: number) => {
      if (!db) {
        console.error('[useShoppingList] updateQuantity called but db is not ready!', { listId, barcode, quantity });
        throw new Error('Database not ready');
      }
      console.log('[useShoppingList] updateQuantity called:', { listId, barcode, quantity });
      
      try {
        await updateItemQuantity(db, listId, barcode, quantity);
        console.log('[useShoppingList] Successfully updated quantity in database');
      } catch (err) {
        console.error('[useShoppingList] Failed to update quantity in database:', err);
        throw err;
      }

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "UPDATE_QTY", { listId, barcode, quantity });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after updateQuantity:", e)
          );
        } catch (e) {
          console.warn("Failed to queue updateQuantity in outbox:", e);
        }
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.map((item) =>
            item.barcode === barcode ? { ...item, quantity } : item
          )
        );
      }
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Update item note
   */
  const updateNote = useCallback(
    async (listId: string, barcode: string, note: string | null) => {
      if (!db) return;
      await updateItemNote(db, listId, barcode, note ?? null);

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "UPDATE_NOTE", { listId, barcode, note: note ?? null });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after updateNote:", e)
          );
        } catch (e) {
          console.warn("Failed to queue updateNote in outbox:", e);
        }
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.map((item) =>
            item.barcode === barcode ? { ...item, note: note ?? undefined } : item
          )
        );
      }
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Toggle item checked state
   */
  const toggleChecked = useCallback(
    async (listId: string, barcode: string) => {
      if (!db) return;
      const newState = await toggleItemChecked(db, listId, barcode);

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "TOGGLE_CHECKED", { listId, barcode });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after toggleChecked:", e)
          );
        } catch (e) {
          console.warn("Failed to queue toggleChecked in outbox:", e);
        }
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.map((item) =>
            item.barcode === barcode ? { ...item, isChecked: newState } : item
          )
        );
      }
      return newState;
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Remove an item from a list
   */
  const removeItem = useCallback(
    async (listId: string, barcode: string) => {
      if (!db) return;
      await removeItemFromList(db, listId, barcode);

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "REMOVE_ITEM", { listId, barcode });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after removeItem:", e)
          );
        } catch (e) {
          console.warn("Failed to queue removeItem in outbox:", e);
        }
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.filter((item) => item.barcode !== barcode)
        );
      }
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Clear checked items
   */
  const clearChecked = useCallback(
    async (listId: string) => {
      if (!db) return;
      await clearCheckedItems(db, listId);

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "CLEAR_CHECKED", { listId });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after clearChecked:", e)
          );
        } catch (e) {
          console.warn("Failed to queue clearChecked in outbox:", e);
        }
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) => prev.filter((item) => !item.isChecked));
      }
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Clear all items
   */
  const clearAll = useCallback(
    async (listId: string) => {
      if (!db) return;
      await clearAllItems(db, listId);

      const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
      if (uid) {
        try {
          await queueOutboxOperation(db, uid, "CLEAR_ALL", { listId });
          drainOutbox(db, uid).catch((e) =>
            console.warn("Failed to drain outbox after clearAll:", e)
          );
        } catch (e) {
          console.warn("Failed to queue clearAll in outbox:", e);
        }
      }

      if (currentList?.listId === listId) {
        setCurrentItems([]);
      }
    },
    [db, currentList, lists, ensureUid]
  );

  /**
   * Get item count for a list
   */
  const getItemCount = useCallback(
    async (listId: string) => {
      if (!db) return 0;
      return await getListItemCount(db, listId);
    },
    [db]
  );

  /**
   * Get a single item by barcode within the given list
   */
  const getItem = useCallback(
    async (listId: string, barcode: string) => {
      if (!db) {
        console.warn('[useShoppingList] getItem called but db is not ready, returning null', { listId, barcode });
        return null;
      }
      console.log('[useShoppingList] getItem called:', { listId, barcode });
      const item = await getItemInList(db, listId, barcode);
      console.log('[useShoppingList] getItem result:', { barcode, exists: !!item, quantity: item?.quantity });
      return item;
    },
    [db]
  );

  return {
    ready: isDbReady && !!userId,
    loading,
    lists,
    currentList,
    currentItems,
    refreshLists,
    createList,
    updateList,
    deleteList,
    loadList,
    addItem,
    updateQuantity,
    updateNote,
    toggleChecked,
    removeItem,
    clearChecked,
    clearAll,
    getItemCount,
    getItem,
    // Backfill all local lists/items to Firestore
    syncAllToFirestore: async () => {
      const uid = await ensureUid();
      if (!uid || !db) return;
      // Ensure we have latest lists
      if (lists.length === 0) {
        await refreshLists();
      }
      for (const l of lists) {
        try {
          // Push list doc
          await createShoppingListFirestore(uid, {
            listId: l.listId,
            userId: uid,
            listName: l.listName,
            color: l.color,
            emoji: l.emoji,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
          });
          // Push items
          const items = await getListItems(db, l.listId);
          for (const it of items) {
            await upsertItemInListFirestore(uid, l.listId, {
              listId: l.listId,
              barcode: it.barcode,
              productName: it.productName,
              brand: it.brand,
              quantity: it.quantity,
              note: it.note,
              isChecked: it.isChecked,
              productJson: it.productJson,
              addedAt: it.addedAt,
              updatedAt: it.updatedAt,
            });
          }
        } catch (e) {
          console.warn("Backfill failed for list", l.listId, e);
        }
      }
    },
  };
}
