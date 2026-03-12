import * as SQLite from "expo-sqlite";
import { db as dbWrapper, Db } from "./db";
import { initBE03Schema } from "./ShoppingListService";

import p0_10 from "../../data/products_0k_10k_enriched.json";
import p10_20 from "../../data/products_10k_20k_enriched.json";
import p20_30 from "../../data/products_20k_30k_enriched.json";
import p30_40 from "../../data/products_30k_40k_enriched.json";
import p40_50 from "../../data/products_40k_50k_enriched.json";
import p50p from "../../data/products_50k_plus_enriched.json";


type AnyProduct = any;

let nativeDb: SQLite.SQLiteDatabase | null = null;

async function getNativeDb() {
  if (!nativeDb) {
    nativeDb = await SQLite.openDatabaseAsync("foodremedy.db");
    // Optional: improve write performance for seeding
    await nativeDb.execAsync(`PRAGMA journal_mode = WAL;`);
    await nativeDb.execAsync(`PRAGMA synchronous = NORMAL;`);
  }
  return nativeDb;
}

function normalizeProduct(p: AnyProduct) {
  const barcode = String(p?.barcode ?? "").trim();
  if (!barcode) return null;

  const name =
    typeof p.productName === "string" && p.productName.trim().length > 0
      ? p.productName.trim()
      : null;

  const brand =
    typeof p.brand === "string" && p.brand.trim().length > 0 ? p.brand.trim() : null;

  const allergens = Array.isArray(p.allergens) ? p.allergens : [];
  const nutrientLevels =
    p.nutrientLevels && typeof p.nutrientLevels === "object" ? p.nutrientLevels : {};

  return {
    barcode,
    name,
    brand,
    allergensJson: JSON.stringify(allergens),
    nutrientLevelsJson: JSON.stringify(nutrientLevels),
  };
}

async function ensureProductsTableAsync() {
  const db = await getNativeDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      barcode TEXT PRIMARY KEY,
      name TEXT,
      brand TEXT,
      allergens TEXT,
      nutrientLevels TEXT
    );
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  `);
}

async function productsCountAsync(): Promise<number> {
  const db = await getNativeDb();
  const rows = await db.getAllAsync<{ c: number }>(`SELECT COUNT(1) as c FROM products`);
  return rows?.[0]?.c ?? 0;
}

async function seedProductsAllChunksIfEmptyAsync() {
  await ensureProductsTableAsync();

  const count = await productsCountAsync();
  if (count > 0) return; // already seeded

  const allProducts: AnyProduct[] = [
    ...(p0_10 as AnyProduct[]),
    ...(p10_20 as AnyProduct[]),
    ...(p20_30 as AnyProduct[]),
    ...(p30_40 as AnyProduct[]),
    ...(p40_50 as AnyProduct[]),
    ...(p50p as AnyProduct[]),
  ];

  const db = await getNativeDb();

  const insertSql = `
    INSERT OR REPLACE INTO products(barcode, name, brand, allergens, nutrientLevels)
    VALUES(?,?,?,?,?)
  `;

  const batchSize = 300; // tune: 200-500 is usually safe
  await db.execAsync("BEGIN");

  try {
    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);


      for (const p of batch) {
        const n = normalizeProduct(p);
        if (!n) continue;

        await db.runAsync(insertSql, [
          n.barcode,
          n.name,
          n.brand,
          n.allergensJson,
          n.nutrientLevelsJson,
        ]);
      }
    }

    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }
}

export async function bootstrapLocalDatabase() {

  await initBE03Schema(dbWrapper as unknown as Db);

  await seedProductsAllChunksIfEmptyAsync();
}
