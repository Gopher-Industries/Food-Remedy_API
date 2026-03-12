import type { SQLiteDatabase } from 'expo-sqlite';
import type { Product } from '@/types/Product';
import { HistoryItem } from '@/types/HistoryItem';

const nowIso = () => new Date().toISOString();

function safeParseProduct(json: string): Product {
  try {
    return JSON.parse(json) as Product;
  } catch {
    // Minimal fallback to avoid crashing UI if JSON is corrupted
    return { barcode: '', productName: '', brand: null } as unknown as Product;
  }
}

/**
 * Upsert a history record for a barcode.
 * - Inserts if missing, else updates snapshot + last_seen_at.
 * - Keeps created_at from first insert.
 */
export async function bumpHistory(
  db: SQLiteDatabase,
  product: Product,
): Promise<void> {
  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO product_history (
       barcode, product_name, brand, product_json, created_at, last_seen_at
     ) VALUES (?,?,?,?,?,?)
     ON CONFLICT(barcode) DO UPDATE SET
       product_name=excluded.product_name,
       brand=excluded.brand,
       product_json=excluded.product_json,
       last_seen_at=excluded.last_seen_at`,
    [
      product.barcode,
      product.productName,
      product.brand,
      JSON.stringify(product),
      ts,   // created_at (ignored on update)
      ts    // last_seen_at
    ]
  );
}

/** Fetch a single history row by barcode (or null). */
export async function getHistoryItem(
  db: SQLiteDatabase,
  barcode: string
): Promise<HistoryItem | null> {
  const row = await db.getFirstAsync<any>(
    `SELECT barcode, product_name, brand, product_json, created_at, last_seen_at
     FROM product_history
     WHERE barcode=?`,
    [barcode]
  );
  if (!row) return null;
  return {
    barcode: row.barcode,
    productName: row.product_name,
    brand: row.brand ?? null,
    product: safeParseProduct(row.product_json),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

/** List history newest-first. */
export async function listHistory(
  db: SQLiteDatabase,
  limit = 200,
  offset = 0
): Promise<HistoryItem[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT barcode, product_name, brand, product_json, created_at, last_seen_at
     FROM product_history
     ORDER BY last_seen_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows.map((r) => ({
    barcode: r.barcode,
    productName: r.product_name,
    brand: r.brand ?? null,
    product: safeParseProduct(r.product_json),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  }));
}

/** Delete a single history entry. */
export async function deleteHistoryEntry(db: SQLiteDatabase, barcode: string): Promise<void> {
  await db.runAsync(`DELETE FROM product_history WHERE barcode=?`, [barcode]);
}

/** Clear all history. */
export async function clearHistory(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`DELETE FROM product_history`);
}

/**
 * Optional: keep only the N most recent entries by last_seen_at.
 * Handy if you want to cap storage growth.
 */
export async function pruneHistory(db: SQLiteDatabase, keep = 500): Promise<void> {
  await db.runAsync(
    `DELETE FROM product_history
     WHERE barcode IN (
       SELECT barcode FROM product_history
       ORDER BY last_seen_at DESC
       LIMIT -1 OFFSET ?
     )`,
    [keep]
  );
}
