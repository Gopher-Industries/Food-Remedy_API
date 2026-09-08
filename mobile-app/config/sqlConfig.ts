import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function initialiseSQLiteDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('food_remedy.db');

      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 3000;
      `);

      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          -- PROFILES
          CREATE TABLE IF NOT EXISTS profiles (
            profile_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0,1)),
            relationship TEXT NOT NULL,
            age INTEGER NOT NULL CHECK (age >= 0),
            avatar_url TEXT NOT NULL,
            additives_json TEXT NOT NULL,
            allergies_json TEXT NOT NULL,
            intolerances_json TEXT NOT NULL,
            dietary_form_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          -- FAVOURITES
          CREATE TABLE IF NOT EXISTS product_favourites (
            user_id TEXT NOT NULL,
            barcode TEXT NOT NULL CHECK (length(barcode) > 0),
            product_name TEXT NOT NULL,
            brand TEXT,
            product_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, barcode)
          );
          CREATE INDEX IF NOT EXISTS idx_favs_user_updated ON product_favourites(user_id, updated_at);

          -- HISTORY
          CREATE TABLE IF NOT EXISTS product_history (
            owner_scope TEXT NOT NULL CHECK (length(owner_scope) > 0),
            barcode TEXT NOT NULL CHECK (length(barcode) > 0),
            product_name TEXT NOT NULL,
            brand TEXT,
            product_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            PRIMARY KEY (owner_scope, barcode)
          );
          CREATE INDEX IF NOT EXISTS idx_hist_owner_last_seen ON product_history(owner_scope, last_seen_at);

          -- SHOPPING LISTS (aligned with DAO)
          CREATE TABLE IF NOT EXISTS shopping_lists (
            list_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            list_name TEXT NOT NULL,
            color TEXT,
            emoji TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_lists_user ON shopping_lists(user_id);

          -- SHOPPING LIST ITEMS (aligned with DAO)
          CREATE TABLE IF NOT EXISTS shopping_list_items (
            list_id TEXT NOT NULL,
            barcode TEXT NOT NULL,
            product_name TEXT NOT NULL,
            brand TEXT,
            quantity INTEGER NOT NULL DEFAULT 1,
            note TEXT,
            is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0,1)),
            product_json TEXT,
            added_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (list_id, barcode),
            FOREIGN KEY (list_id) REFERENCES shopping_lists(list_id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_items_list_added ON shopping_list_items(list_id, added_at);
        `);

        // Versioning
        const [{ user_version = 0 } = { user_version: 0 }] =
          await db.getAllAsync<{ user_version: number }>('PRAGMA user_version;');
        let v = user_version;

        if (v < 3) {
          await db.execAsync(`PRAGMA user_version = 3;`);
          v = 3;
        }

        // Migration to align shopping list schema with DAO expectations
        // Detect and migrate old columns (name -> list_name, add color; items: checked -> is_checked, add product_json, updated_at)
        const listCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('shopping_lists');`);
        const hasListNameCol = listCols.some(c => c.name === 'list_name');
        const hasEmojiCol = listCols.some(c => c.name === 'emoji');
        if (!hasListNameCol) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS shopping_lists_new (
              list_id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              list_name TEXT NOT NULL,
              color TEXT,
              emoji TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
          // Copy data from old table (name -> list_name), set color NULL
          await db.execAsync(`
            INSERT INTO shopping_lists_new (list_id, user_id, list_name, color, emoji, created_at, updated_at)
            SELECT list_id, user_id, name AS list_name, NULL AS color, NULL AS emoji, created_at, updated_at FROM shopping_lists;
          `);
          await db.execAsync(`DROP TABLE shopping_lists;`);
          await db.execAsync(`ALTER TABLE shopping_lists_new RENAME TO shopping_lists;`);
        }
        if (!hasEmojiCol) {
          await db.execAsync(`ALTER TABLE shopping_lists ADD COLUMN emoji TEXT;`);
        }

        const itemCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('shopping_list_items');`);
        const hasIsCheckedCol = itemCols.some(c => c.name === 'is_checked');
        const hasUpdatedAtCol = itemCols.some(c => c.name === 'updated_at');
        const hasProductJsonCol = itemCols.some(c => c.name === 'product_json');
        const hasNoteCol = itemCols.some(c => c.name === 'note');
        // If any of the expected columns are missing, rebuild the items table
        if (!hasIsCheckedCol || !hasUpdatedAtCol || !hasProductJsonCol) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS shopping_list_items_new (
              list_id TEXT NOT NULL,
              barcode TEXT NOT NULL,
              product_name TEXT NOT NULL,
              brand TEXT,
              quantity INTEGER NOT NULL DEFAULT 1,
              note TEXT,
              is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0,1)),
              product_json TEXT,
              added_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (list_id, barcode),
              FOREIGN KEY (list_id) REFERENCES shopping_lists(list_id) ON DELETE CASCADE
            );
          `);
          // Copy available columns; derive updated_at from added_at; set product_json NULL
          await db.execAsync(`
            INSERT INTO shopping_list_items_new (list_id, barcode, product_name, brand, quantity, note, is_checked, product_json, added_at, updated_at)
            SELECT list_id, barcode, product_name, brand, quantity,
                   NULL AS note,
                   CASE WHEN checked IS NULL THEN 0 ELSE checked END AS is_checked,
                   NULL AS product_json,
                   added_at,
                   added_at AS updated_at
            FROM shopping_list_items;
          `);
          await db.execAsync(`DROP TABLE shopping_list_items;`);
          await db.execAsync(`ALTER TABLE shopping_list_items_new RENAME TO shopping_list_items;`);
        }
        // If only 'note' is missing, add it via ALTER TABLE
        if (hasIsCheckedCol && hasUpdatedAtCol && hasProductJsonCol && !hasNoteCol) {
          await db.execAsync(`ALTER TABLE shopping_list_items ADD COLUMN note TEXT;`);
        }

        // Migration: add demographic columns to profiles
        const profileCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('profiles');`);
        const hasAgeBandCol = profileCols.some(c => c.name === 'age_band');
        const hasSexCol = profileCols.some(c => c.name === 'sex');
        const hasGuardrailLevelCol = profileCols.some(c => c.name === 'guardrail_level');
        if (!hasAgeBandCol) {
          await db.execAsync(`ALTER TABLE profiles ADD COLUMN age_band TEXT;`);
        }
        if (!hasSexCol) {
          await db.execAsync(`ALTER TABLE profiles ADD COLUMN sex TEXT;`);
        }
        if (!hasGuardrailLevelCol) {
          await db.execAsync(`ALTER TABLE profiles ADD COLUMN guardrail_level TEXT;`);
        }

        // BE028: product history/cache snapshots must be isolated per account/guest scope.
        // Legacy rows had no reliable owner, so keep them under an unowned scope that normal
        // account/guest reads never use.
        const historyCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('product_history');`);
        const hasHistoryOwnerScopeCol = historyCols.some(c => c.name === 'owner_scope');
        const historyPkCols = historyCols
          .filter(c => (c as any).pk > 0)
          .sort((a, b) => ((a as any).pk ?? 0) - ((b as any).pk ?? 0))
          .map(c => c.name);
        const hasScopedHistoryPrimaryKey =
          historyPkCols.length === 2 &&
          historyPkCols[0] === 'owner_scope' &&
          historyPkCols[1] === 'barcode';

        if (!hasHistoryOwnerScopeCol || !hasScopedHistoryPrimaryKey) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS product_history_new (
              owner_scope TEXT NOT NULL CHECK (length(owner_scope) > 0),
              barcode TEXT NOT NULL CHECK (length(barcode) > 0),
              product_name TEXT NOT NULL,
              brand TEXT,
              product_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL,
              PRIMARY KEY (owner_scope, barcode)
            );
          `);

          if (historyCols.length > 0 && hasHistoryOwnerScopeCol) {
            await db.execAsync(`
              INSERT OR REPLACE INTO product_history_new (
                owner_scope, barcode, product_name, brand, product_json, created_at, last_seen_at
              )
              SELECT
                COALESCE(NULLIF(owner_scope, ''), 'legacy:unowned') AS owner_scope,
                barcode,
                product_name,
                brand,
                product_json,
                created_at,
                last_seen_at
              FROM product_history;
            `);
          } else if (historyCols.length > 0) {
            await db.execAsync(`
              INSERT OR REPLACE INTO product_history_new (
                owner_scope, barcode, product_name, brand, product_json, created_at, last_seen_at
              )
              SELECT
                'legacy:unowned' AS owner_scope,
                barcode,
                product_name,
                brand,
                product_json,
                created_at,
                last_seen_at
              FROM product_history;
            `);
          }

          await db.execAsync(`DROP TABLE product_history;`);
          await db.execAsync(`ALTER TABLE product_history_new RENAME TO product_history;`);
        }

        await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_hist_owner_last_seen ON product_history(owner_scope, last_seen_at);`);
        await db.execAsync(`DROP INDEX IF EXISTS idx_hist_last_seen;`);

        await db.execAsync(`PRAGMA user_version = 6;`);
      });

      return db;
    })();
  }
  return dbPromise;
}
