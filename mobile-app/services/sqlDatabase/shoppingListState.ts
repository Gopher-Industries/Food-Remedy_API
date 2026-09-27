import type { Dispatch, SetStateAction } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Product } from "@/types/Product";
import type { ShoppingList, ShoppingListItem } from "@/types/ShoppingList";
import { getListItems, getShoppingList } from "./shoppingList.dao";

type LoadedItem = ShoppingListItem & { product: Product };

/** Load one owned list and atomically replace any previously displayed list state. */
export async function loadOwnedShoppingListState(
  db: SQLiteDatabase,
  userId: string,
  listId: string,
  setCurrentList: Dispatch<SetStateAction<ShoppingList | null>>,
  setCurrentItems: Dispatch<SetStateAction<LoadedItem[]>>
): Promise<boolean> {
  const list = await getShoppingList(db, userId, listId);
  if (!list) {
    setCurrentList(null);
    setCurrentItems([]);
    return false;
  }

  const items = await getListItems(db, userId, listId);
  setCurrentList(list);
  setCurrentItems(items);
  return true;
}
