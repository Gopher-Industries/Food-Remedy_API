// Use History

import { useCallback, useState } from "react";
import { useSQLiteDatabase } from "@/components/providers/SQLiteDatabaseProvider";
import type { Product } from "@/types/Product";
import { listHistory, bumpHistory, deleteHistoryEntry, clearHistory, pruneHistory, } from "@/services/sqlDatabase/history.dao";
import type { HistoryItem } from "@/types/HistoryItem";

export function useHistory() {
  const { db, isDbReady } = useSQLiteDatabase();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Refresh
   */
  const refresh = useCallback(async () => {
    if (!db || !isDbReady) return;
    setLoading(true);
    try {
      const rows = await listHistory(db, 200, 0);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [db, isDbReady]);

  /**
   * Fire-and-Forget Bump
   * Let the page decide whether to refresh
   */
  const bump = useCallback(async (product: Product) => {
    if (!db) return;
    try {
      await bumpHistory(db, product);
      // Optional: cap storage
      await pruneHistory(db, 500);
    } catch (e) {
      console.warn("bump history failed", e);
    }
  }, [db]);

  /**
   * Remove
   */
  const remove = useCallback(async (barcode: string) => {
    if (!db) return;
    await deleteHistoryEntry(db, barcode);
    // optimistically update local list; page can also call refresh()
    setItems(prev => prev.filter(i => i.barcode !== barcode));
  }, [db]);

  /**
   * Clear All
   */
  const clearAll = useCallback(async () => {
    if (!db) return;
    await clearHistory(db);
    setItems([]);
  }, [db]);

  return {
    ready: isDbReady,
    items,
    loading,
    refresh, bump, remove, clearAll,
  };
}
