// Use Favourites Hook ts

import { useCallback, useState } from "react";
import { useSQLiteDatabase } from "@/components/providers/SQLiteDatabaseProvider";
import { useDeviceUserId } from "@/hooks/useDeviceUserId";
import type { FavouriteItem } from "@/types/FavouriteItem";
import type { Product } from "@/types/Product";
import {
  listFavourites, setFavourite, toggleFavourite,
  removeFavourite, clearFavourites, isFavourite,
} from "@/services/sqlDatabase/favourites.dao";

export function useFavourites() {
  const { db, isDbReady } = useSQLiteDatabase();
  const userId = useDeviceUserId();
  const [items, setItems] = useState<FavouriteItem[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Refresh favourites list
   */
  const refresh = useCallback(async () => {
    if (!db || !isDbReady || !userId) return;
    setLoading(true);
    try {
      const rows = await listFavourites(db, userId, 200, 0);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [db, isDbReady, userId]);

  /**
   * Add or remove favourite explicitly
   */
  const set = useCallback(
    async (product: Product, on: boolean) => {
      if (!db || !userId) return;
      await setFavourite(db, userId, product, on);
      // optimistically update state
      if (on) {
        setItems((prev) => [
          {
            userId,
            barcode: product.barcode,
            productName: product.productName,
            brand: product.brand ?? null,
            product,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...prev.filter((i) => i.barcode !== product.barcode),
        ]);
      } else {
        setItems((prev) => prev.filter((i) => i.barcode !== product.barcode));
      }
    },
    [db, userId]
  );

  /**
   * Toggle favourite, return new state
   */
  const toggle = useCallback(
    async (product: Product) => {
      if (!db || !userId) return false;
      const newState = await toggleFavourite(db, userId, product);
      if (newState) {
        setItems((prev) => [
          {
            userId,
            barcode: product.barcode,
            productName: product.productName,
            brand: product.brand ?? null,
            product,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...prev.filter((i) => i.barcode !== product.barcode),
        ]);
      } else {
        setItems((prev) => prev.filter((i) => i.barcode !== product.barcode));
      }
      return newState;
    },
    [db, userId]
  );

  /**
   * Remove a favourite
   */
  const remove = useCallback(
    async (barcode: string) => {
      if (!db || !userId) return;
      await removeFavourite(db, userId, barcode);
      setItems((prev) => prev.filter((i) => i.barcode !== barcode));
    },
    [db, userId]
  );

  /**
   * Clear all
   */
  const clearAll = useCallback(async () => {
    if (!db || !userId) return;
    await clearFavourites(db, userId);
    setItems([]);
  }, [db, userId]);

  /**
   * Check if a product is favourited
   */
  const check = useCallback(
    async (barcode: string) => {
      if (!db || !userId) return false;
      return await isFavourite(db, userId, barcode);
    },
    [db, userId]
  );

  return {
    ready: isDbReady && !!userId,
    items,
    loading,
    refresh,
    set,
    toggle,
    remove,
    clearAll,
    check,
  };
}
