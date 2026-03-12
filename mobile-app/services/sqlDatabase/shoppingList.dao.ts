// Shopping List Data Access Object

import { ShoppingList, ShoppingListItem } from "@/types/ShoppingList";
import { Product } from "@/types/Product";
import type { SQLiteDatabase } from "expo-sqlite";
import { v4 as uuidv4 } from "uuid";

const nowIso = () => new Date().toISOString();
const J = (v: unknown) => JSON.stringify(v ?? null);

function safeParseProduct(s: string): Product {
  try {
    return JSON.parse(s);
  } catch {
    return {} as Product;
  }
}

// ============== SHOPPING LISTS ==============

/**
 * Create a new shopping list
 */
export async function createShoppingList(
  db: SQLiteDatabase,
  userId: string,
  listName: string,
  color?: string,
  emoji?: string
): Promise<ShoppingList> {
  const listId = uuidv4();
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO shopping_lists (list_id, user_id, list_name, color, emoji, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [listId, userId, listName, color ?? null, emoji ?? null, now, now]
  );

  return {
    listId,
    userId,
    listName,
    color,
    emoji,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Upsert a shopping list (cloud -> local sync)
 */
export async function upsertShoppingList(
  db: SQLiteDatabase,
  list: ShoppingList
): Promise<void> {
  await db.runAsync(
    `INSERT INTO shopping_lists (list_id, user_id, list_name, color, emoji, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(list_id) DO UPDATE SET
       user_id = excluded.user_id,
       list_name = excluded.list_name,
       color = excluded.color,
       emoji = excluded.emoji,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    [
      list.listId,
      list.userId,
      list.listName,
      list.color ?? null,
      list.emoji ?? null,
      list.createdAt,
      list.updatedAt,
    ]
  );
}

/**
 * Get all shopping lists for a user
 */
export async function getShoppingLists(
  db: SQLiteDatabase,
  userId: string
): Promise<ShoppingList[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT list_id, user_id, list_name, color, emoji, created_at, updated_at
     FROM shopping_lists
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [userId]
  );

  return rows.map((r) => ({
    listId: r.list_id,
    userId: r.user_id,
    listName: r.list_name,
    color: r.color ?? undefined,
    emoji: r.emoji ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Get a single shopping list
 */
export async function getShoppingList(
  db: SQLiteDatabase,
  listId: string
): Promise<ShoppingList | null> {
  const rows = await db.getAllAsync<any>(
    `SELECT list_id, user_id, list_name, color, emoji, created_at, updated_at
     FROM shopping_lists
     WHERE list_id = ?`,
    [listId]
  );

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    listId: r.list_id,
    userId: r.user_id,
    listName: r.list_name,
    color: r.color ?? undefined,
    emoji: r.emoji ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Update shopping list name or color
 */
export async function updateShoppingList(
  db: SQLiteDatabase,
  listId: string,
  updates: { listName?: string; color?: string; emoji?: string }
): Promise<void> {
  const now = nowIso();

  if (updates.listName !== undefined) {
    await db.runAsync(
      `UPDATE shopping_lists SET list_name = ?, updated_at = ? WHERE list_id = ?`,
      [updates.listName, now, listId]
    );
  }

  if (updates.color !== undefined) {
    await db.runAsync(
      `UPDATE shopping_lists SET color = ?, updated_at = ? WHERE list_id = ?`,
      [updates.color, now, listId]
    );
  }

  if (updates.emoji !== undefined) {
    await db.runAsync(
      `UPDATE shopping_lists SET emoji = ?, updated_at = ? WHERE list_id = ?`,
      [updates.emoji ?? null, now, listId]
    );
  }
}

/**
 * Delete a shopping list (will cascade delete items)
 */
export async function deleteShoppingList(
  db: SQLiteDatabase,
  listId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM shopping_lists WHERE list_id = ?`, [listId]);
}

// ============== SHOPPING LIST ITEMS ==============

/**
 * Add a product to a shopping list
 */
export async function addItemToList(
  db: SQLiteDatabase,
  listId: string,
  product: Product,
  quantity: number = 1,
  note?: string
): Promise<void> {
  const now = nowIso();

  // Check if item already exists; if so, increment quantity
  const existingRows = await db.getAllAsync<any>(
    `SELECT quantity FROM shopping_list_items WHERE list_id = ? AND barcode = ?`,
    [listId, product.barcode]
  );

  if (existingRows.length > 0) {
    const currentQty = Number(existingRows[0].quantity) || 0;
    const nextQty = Math.max(1, currentQty + (quantity || 0));

    await db.runAsync(
      `UPDATE shopping_list_items 
       SET quantity = ?, note = COALESCE(?, note), product_name = ?, brand = ?, product_json = ?, updated_at = ?
       WHERE list_id = ? AND barcode = ?`,
      [
        nextQty,
        note ?? null,
        product.productName,
        product.brand ?? null,
        J(product),
        now,
        listId,
        product.barcode,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO shopping_list_items 
       (list_id, barcode, product_name, brand, quantity, note, is_checked, product_json, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        listId,
        product.barcode,
        product.productName,
        product.brand ?? null,
        Math.max(1, quantity || 1),
        note ?? null,
        J(product),
        now,
        now,
      ]
    );
  }

  // Update the list's updated_at timestamp
  await db.runAsync(
    `UPDATE shopping_lists SET updated_at = ? WHERE list_id = ?`,
    [now, listId]
  );
}

/**
 * Upsert a shopping list item (cloud -> local sync)
 */
export async function upsertListItem(
  db: SQLiteDatabase,
  item: ShoppingListItem
): Promise<void> {
  await db.runAsync(
    `INSERT INTO shopping_list_items
     (list_id, barcode, product_name, brand, quantity, note, is_checked, product_json, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(list_id, barcode) DO UPDATE SET
       product_name = excluded.product_name,
       brand = excluded.brand,
       quantity = excluded.quantity,
       note = excluded.note,
       is_checked = excluded.is_checked,
       product_json = excluded.product_json,
       added_at = excluded.added_at,
       updated_at = excluded.updated_at`,
    [
      item.listId,
      item.barcode,
      item.productName,
      item.brand ?? null,
      item.quantity,
      item.note ?? null,
      item.isChecked ? 1 : 0,
      item.productJson ?? null,
      item.addedAt,
      item.updatedAt,
    ]
  );
}

/**
 * Get all items in a shopping list
 */
export async function getListItems(
  db: SQLiteDatabase,
  listId: string
): Promise<(ShoppingListItem & { product: Product })[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT list_id, barcode, product_name, brand, quantity, note, is_checked, product_json, added_at, updated_at
     FROM shopping_list_items
     WHERE list_id = ?
     ORDER BY is_checked ASC, added_at DESC`,
    [listId]
  );

  return rows.map((r) => ({
    listId: r.list_id,
    barcode: r.barcode,
    productName: r.product_name,
    brand: r.brand ?? null,
    quantity: r.quantity,
    note: r.note ?? undefined,
    isChecked: r.is_checked === 1,
    productJson: r.product_json,
    addedAt: r.added_at,
    updatedAt: r.updated_at,
    product: safeParseProduct(r.product_json),
  }));
}

/**
 * Update item quantity
 */
export async function updateItemQuantity(
  db: SQLiteDatabase,
  listId: string,
  barcode: string,
  quantity: number
): Promise<void> {
  const now = nowIso();

  await db.runAsync(
    `UPDATE shopping_list_items SET quantity = ?, updated_at = ? WHERE list_id = ? AND barcode = ?`,
    [quantity, now, listId, barcode]
  );
}

/**
 * Update item note
 */
export async function updateItemNote(
  db: SQLiteDatabase,
  listId: string,
  barcode: string,
  note: string | null
): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `UPDATE shopping_list_items SET note = ?, updated_at = ? WHERE list_id = ? AND barcode = ?`,
    [note ?? null, now, listId, barcode]
  );
}

/**
 * Toggle item checked state
 */
export async function toggleItemChecked(
  db: SQLiteDatabase,
  listId: string,
  barcode: string
): Promise<boolean> {
  const now = nowIso();

  // Get current state
  const rows = await db.getAllAsync<any>(
    `SELECT is_checked FROM shopping_list_items WHERE list_id = ? AND barcode = ?`,
    [listId, barcode]
  );

  if (rows.length === 0) return false;

  const newState = rows[0].is_checked === 0 ? 1 : 0;

  await db.runAsync(
    `UPDATE shopping_list_items SET is_checked = ?, updated_at = ? WHERE list_id = ? AND barcode = ?`,
    [newState, now, listId, barcode]
  );

  return newState === 1;
}

/**
 * Remove an item from a shopping list
 */
export async function removeItemFromList(
  db: SQLiteDatabase,
  listId: string,
  barcode: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM shopping_list_items WHERE list_id = ? AND barcode = ?`,
    [listId, barcode]
  );
}

/**
 * Clear all checked items from a list
 */
export async function clearCheckedItems(
  db: SQLiteDatabase,
  listId: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM shopping_list_items WHERE list_id = ? AND is_checked = 1`,
    [listId]
  );
}

/**
 * Clear all items from a list
 */
export async function clearAllItems(
  db: SQLiteDatabase,
  listId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM shopping_list_items WHERE list_id = ?`, [
    listId,
  ]);
}

/**
 * Get item count for a list
 */
export async function getListItemCount(
  db: SQLiteDatabase,
  listId: string
): Promise<number> {
  const rows = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM shopping_list_items WHERE list_id = ?`,
    [listId]
  );

  return rows[0]?.count ?? 0;
}

/**
 * Get a single item by barcode within a list
 */
export async function getItemInList(
  db: SQLiteDatabase,
  listId: string,
  barcode: string
): Promise<ShoppingListItem | null> {
  const rows = await db.getAllAsync<any>(
    `SELECT list_id, barcode, product_name, brand, quantity, note, is_checked, product_json, added_at, updated_at
     FROM shopping_list_items WHERE list_id = ? AND barcode = ?`,
    [listId, barcode]
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    listId: r.list_id,
    barcode: r.barcode,
    productName: r.product_name,
    brand: r.brand ?? null,
    quantity: r.quantity,
    note: r.note ?? undefined,
    isChecked: r.is_checked === 1,
    productJson: r.product_json,
    addedAt: r.added_at,
    updatedAt: r.updated_at,
  };
}
