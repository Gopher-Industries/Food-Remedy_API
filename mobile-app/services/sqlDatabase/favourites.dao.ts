import { FavouriteItem } from '@/types/FavouriteItem';
import { Product } from '@/types/Product';
import type { SQLiteDatabase } from 'expo-sqlite';

const nowIso = () => new Date().toISOString();
const J = (v: unknown) => JSON.stringify(v ?? null);

function safeParseProduct(s: string): Product {
  try { return JSON.parse(s) as Product; }
  catch { return { barcode: '', productName: '', brand: null } as unknown as Product; }
}

/** Upsert favourite (on=true) or delete (on=false). */
export async function setFavourite(
  db: SQLiteDatabase,
  userId: string,
  product: Product,
  on = true
): Promise<void> {
  if (!on) {
    await removeFavourite(db, userId, product.barcode);
    return;
  }
  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO product_favourites (
       user_id, barcode, product_name, brand, product_json, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(user_id, barcode) DO UPDATE SET
       product_name=excluded.product_name,
       brand=excluded.brand,
       product_json=excluded.product_json,
       updated_at=excluded.updated_at`,
    [userId, product.barcode, product.productName, product.brand, J(product), ts, ts]
  );
}

/** Toggle favourite. Returns the new state (true = now favourited). */
export async function toggleFavourite(
  db: SQLiteDatabase,
  userId: string,
  product: Product
): Promise<boolean> {
  if (await isFavourite(db, userId, product.barcode)) {
    await removeFavourite(db, userId, product.barcode);
    return false;
  }
  await setFavourite(db, userId, product, true);
  return true;
}

/** Remove a favourite. */
export async function removeFavourite(
  db: SQLiteDatabase,
  userId: string,
  barcode: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM product_favourites WHERE user_id=? AND barcode=?`,
    [userId, barcode]
  );
}

/** Check if favourited. */
export async function isFavourite(
  db: SQLiteDatabase,
  userId: string,
  barcode: string
): Promise<boolean> {
  const row = await db.getFirstAsync(
    `SELECT 1 FROM product_favourites WHERE user_id=? AND barcode=?`,
    [userId, barcode]
  );
  return !!row;
}

/** Get a single favourite (parsed snapshot), or null. */
export async function getFavourite(
  db: SQLiteDatabase,
  userId: string,
  barcode: string
): Promise<FavouriteItem | null> {
  const row = await db.getFirstAsync<any>(
    `SELECT user_id, barcode, product_name, brand, product_json, created_at, updated_at
     FROM product_favourites
     WHERE user_id=? AND barcode=?`,
    [userId, barcode]
  );
  if (!row) return null;
  return {
    userId: row.user_id,
    barcode: row.barcode,
    productName: row.product_name,
    brand: row.brand ?? null,
    product: safeParseProduct(row.product_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** List favourites for a user, newest first. */
export async function listFavourites(
  db: SQLiteDatabase,
  userId: string,
  limit = 100,
  offset = 0
): Promise<FavouriteItem[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT user_id, barcode, product_name, brand, product_json, created_at, updated_at
     FROM product_favourites
     WHERE user_id=?
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    barcode: r.barcode,
    productName: r.product_name,
    brand: r.brand ?? null,
    product: safeParseProduct(r.product_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Clear all favourites for a user. */
export async function clearFavourites(
  db: SQLiteDatabase,
  userId: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM product_favourites WHERE user_id=?`,
    [userId]
  );
}
