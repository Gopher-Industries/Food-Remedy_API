// Use History

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSQLiteDatabase } from "@/components/providers/SQLiteDatabaseProvider";
import type { Product } from "@/types/Product";
import { listHistory, bumpHistory, deleteHistoryEntry, clearHistory, pruneHistory, } from "@/services/sqlDatabase/history.dao";
import type { HistoryItem } from "@/types/HistoryItem";
import { useAuth } from "@/components/providers/AuthProvider";
import { getHistoryOwnerScope } from "@/services/session/historyOwnerScope";

export function useHistory() {
  const { db, isDbReady } = useSQLiteDatabase();
  const { sessionType, user } = useAuth();
  const ownerScope = useMemo(
    () => getHistoryOwnerScope(sessionType, user?.uid),
    [sessionType, user?.uid]
  );
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setItems([]);
    setLoading(false);
  }, [ownerScope]);

  /**
   * Refresh
   */
  const refresh = useCallback(async () => {
    if (!db || !isDbReady || !ownerScope) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listHistory(db, ownerScope, 200, 0);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [db, isDbReady, ownerScope]);

  /**
   * Fire-and-Forget Bump
   * Let the page decide whether to refresh
   */
  const bump = useCallback(async (product: Product) => {
    if (!db || !ownerScope) return;
    try {
      await bumpHistory(db, ownerScope, product);
      // Optional: cap storage
      await pruneHistory(db, ownerScope, 500);
    } catch (e) {
      console.warn("bump history failed", e);
    }
  }, [db, ownerScope]);

  /**
   * Remove
   */
  const remove = useCallback(async (barcode: string) => {
    if (!db || !ownerScope) return;
    await deleteHistoryEntry(db, ownerScope, barcode);
    // optimistically update local list; page can also call refresh()
    setItems(prev => prev.filter(i => i.barcode !== barcode));
  }, [db, ownerScope]);

  /**
   * Clear All
   */
  const clearAll = useCallback(async () => {
    if (!db || !ownerScope) return;
    await clearHistory(db, ownerScope);
    setItems([]);
  }, [db, ownerScope]);

  return {
    ready: isDbReady,
    items,
    loading,
    refresh, bump, remove, clearAll,
  };
}
