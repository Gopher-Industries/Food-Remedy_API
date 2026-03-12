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
      if (!db || !userId) return null;
      const newList = await createShoppingList(db, userId, listName, color, emoji);
      // Fire-and-forget sync to Firestore; keep same listId
      try {
        await createShoppingListFirestore(userId, newList);
      } catch (e) {
        // Ignore Firestore errors for offline/permissions; local is source of truth
        console.warn("Failed to sync list to Firestore:", e);
      }
      setLists((prev) => [newList, ...prev]);
      return newList;
    },
    [db, userId]
  );

  /**
   * Update a shopping list
   */
  const updateList = useCallback(
    async (listId: string, updates: { listName?: string; color?: string; emoji?: string }) => {
      if (!db) return;
      await updateShoppingList(db, listId, updates);
      // Attempt to sync patch to Firestore
      try {
        if (userId) {
          await updateShoppingListFirestore(userId, listId, updates);
        }
      } catch (e) {
        console.warn("Failed to sync list update to Firestore:", e);
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
    [db, currentList, userId]
  );

  /**
   * Delete a shopping list
   */
  const deleteList = useCallback(
    async (listId: string) => {
      if (!db) return;
      await deleteShoppingList(db, listId);
      try {
        if (userId) {
          await deleteShoppingListFirestore(userId, listId);
        }
      } catch (e) {
        console.warn("Failed to delete list in Firestore:", e);
      }
      setLists((prev) => prev.filter((list) => list.listId !== listId));
      if (currentList?.listId === listId) {
        setCurrentList(null);
        setCurrentItems([]);
      }
    },
    [db, currentList, userId]
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
      if (!db) return;
      await addItemToList(db, listId, product, quantity, note);

      // Sync to Firestore (non-blocking)
      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await addItemToListFirestore(uid, listId, product, quantity, note);
      } catch (e) {
        console.warn("Failed to sync item add to Firestore:", e);
      }

      // If this is the current list, refresh items
      if (currentList?.listId === listId) {
        const items = await getListItems(db, listId);
        setCurrentItems(items);
      }
    },
    [db, currentList]
  );

  /**
   * Update item quantity
   */
  const updateQuantity = useCallback(
    async (listId: string, barcode: string, quantity: number) => {
      if (!db) return;
      await updateItemQuantity(db, listId, barcode, quantity);

      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await updateItemQuantityFirestore(uid, listId, barcode, quantity);
      } catch (e) {
        console.warn("Failed to sync quantity to Firestore:", e);
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.map((item) =>
            item.barcode === barcode ? { ...item, quantity } : item
          )
        );
      }
    },
    [db, currentList]
  );

  /**
   * Update item note
   */
  const updateNote = useCallback(
    async (listId: string, barcode: string, note: string | null) => {
      if (!db) return;
      await updateItemNote(db, listId, barcode, note ?? null);

      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await updateItemNoteFirestore(uid, listId, barcode, note ?? null);
      } catch (e) {
        console.warn("Failed to sync note to Firestore:", e);
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.map((item) =>
            item.barcode === barcode ? { ...item, note: note ?? undefined } : item
          )
        );
      }
    },
    [db, currentList]
  );

  /**
   * Toggle item checked state
   */
  const toggleChecked = useCallback(
    async (listId: string, barcode: string) => {
      if (!db) return;
      const newState = await toggleItemChecked(db, listId, barcode);

      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await toggleItemCheckedFirestore(uid, listId, barcode);
      } catch (e) {
        console.warn("Failed to sync check toggle to Firestore:", e);
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

      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await removeItemFromListFirestore(uid, listId, barcode);
      } catch (e) {
        console.warn("Failed to sync item removal to Firestore:", e);
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) =>
          prev.filter((item) => item.barcode !== barcode)
        );
      }
    },
    [db, currentList]
  );

  /**
   * Clear checked items
   */
  const clearChecked = useCallback(
    async (listId: string) => {
      if (!db) return;
      await clearCheckedItems(db, listId);

      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await clearCheckedItemsFirestore(uid, listId);
      } catch (e) {
        console.warn("Failed to sync clear checked to Firestore:", e);
      }

      if (currentList?.listId === listId) {
        setCurrentItems((prev) => prev.filter((item) => !item.isChecked));
      }
    },
    [db, currentList]
  );

  /**
   * Clear all items
   */
  const clearAll = useCallback(
    async (listId: string) => {
      if (!db) return;
      await clearAllItems(db, listId);

      try {
        const uid = lists.find((l) => l.listId === listId)?.userId || (await ensureUid());
        if (uid) await clearAllItemsFirestore(uid, listId);
      } catch (e) {
        console.warn("Failed to sync clear all to Firestore:", e);
      }

      if (currentList?.listId === listId) {
        setCurrentItems([]);
      }
    },
    [db, currentList]
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
      if (!db) return null;
      return await getItemInList(db, listId, barcode);
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
