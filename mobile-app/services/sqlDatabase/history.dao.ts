import type { SQLiteDatabase } from 'expo-sqlite';
import type { Product } from '@/types/Product';
import { HistoryItem } from '@/types/HistoryItem';

export const LEGACY_HISTORY_OWNER_SCOPE = 'legacy:unowned';
export const GUEST_HISTORY_OWNER_SCOPE = 'guest:local';

export function getAuthenticatedHistoryOwnerScope(uid: string): string {
  return `user:${uid}`;
}

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
  ownerScope: string,
  product: Product,
): Promise<void> {
  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO product_history (
       owner_scope, barcode, product_name, brand, product_json, created_at, last_seen_at
     ) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(owner_scope, barcode) DO UPDATE SET
       product_name=excluded.product_name,
       brand=excluded.brand,
       product_json=excluded.product_json,
       last_seen_at=excluded.last_seen_at`,
    [
      ownerScope,
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
  ownerScope: string,
  barcode: string
): Promise<HistoryItem | null> {
  const row = await db.getFirstAsync<any>(
    `SELECT owner_scope, barcode, product_name, brand, product_json, created_at, last_seen_at
     FROM product_history
     WHERE owner_scope=? AND barcode=?`,
    [ownerScope, barcode]
  );
  if (!row) return null;
  return {
    ownerScope: row.owner_scope,
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
  ownerScope: string,
  limit = 200,
  offset = 0
): Promise<HistoryItem[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT owner_scope, barcode, product_name, brand, product_json, created_at, last_seen_at
     FROM product_history
     WHERE owner_scope=?
     ORDER BY last_seen_at DESC
     LIMIT ? OFFSET ?`,
    [ownerScope, limit, offset]
  );
  return rows.map((r) => ({
    ownerScope: r.owner_scope,
    barcode: r.barcode,
    productName: r.product_name,
    brand: r.brand ?? null,
    product: safeParseProduct(r.product_json),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  }));
}

/** Delete a single history entry. */
export async function deleteHistoryEntry(
  db: SQLiteDatabase,
  ownerScope: string,
  barcode: string
): Promise<void> {
  await db.runAsync(`DELETE FROM product_history WHERE owner_scope=? AND barcode=?`, [ownerScope, barcode]);
}

/** Clear all history for the active account/guest scope. */
export async function clearHistory(db: SQLiteDatabase, ownerScope: string): Promise<void> {
  await db.runAsync(`DELETE FROM product_history WHERE owner_scope=?`, [ownerScope]);
}

/**
 * Optional: keep only the N most recent entries by last_seen_at.
 * Handy if you want to cap storage growth.
 */
export async function pruneHistory(db: SQLiteDatabase, ownerScope: string, keep = 500): Promise<void> {
  await db.runAsync(
    `DELETE FROM product_history
     WHERE owner_scope=? AND barcode IN (
       SELECT barcode FROM product_history
       WHERE owner_scope=?
       ORDER BY last_seen_at DESC
       LIMIT -1 OFFSET ?
     )`,
    [ownerScope, ownerScope, keep]
  );
}
