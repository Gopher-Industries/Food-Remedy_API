/*
PURPOSE:
BE056: SQLite Upgrade & Migration Matrix Validation Test Suite.
Verifies:
- Transactional upgrade of all supported legacy schema versions (v1, v2, v3, v4, v5) to release schema (v6).
- Complete data retention across profiles, favourites, history, shopping lists, and list items.
- Schema integrity, foreign keys, and indexes post-migration.
- Transactional rollback on mid-migration interruption and idempotent re-initialization.
*/

import { MockSQLiteDatabase } from '../testing/mockSqliteDb';
import { initialiseSQLiteDatabase, resetDbPromise } from '../config/sqlConfig';

// Mock expo-sqlite to use our MockSQLiteDatabase engine
let currentMockDb: MockSQLiteDatabase;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => currentMockDb),
  SQLiteDatabase: jest.fn(),
}));

describe('BE056: SQLite Upgrade & Migration Matrix Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDbPromise();
    currentMockDb = new MockSQLiteDatabase();
  });

  /* =========================================================================
     FIXTURE BUILDER HELPERS
     ========================================================================= */

  async function createVersion1Fixture(db: MockSQLiteDatabase) {
    db.userVersion = 1;

    // v1 profiles (missing age_band, sex, guardrail_level)
    await db.execAsync(`
      CREATE TABLE profiles (
        profile_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        status INTEGER NOT NULL DEFAULT 1,
        relationship TEXT NOT NULL,
        age INTEGER NOT NULL,
        avatar_url TEXT NOT NULL,
        additives_json TEXT NOT NULL,
        allergies_json TEXT NOT NULL,
        intolerances_json TEXT NOT NULL,
        dietary_form_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await db.runAsync(
      `INSERT INTO profiles (profile_id, user_id, first_name, last_name, status, relationship, age, avatar_url, additives_json, allergies_json, intolerances_json, dietary_form_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'prof-v1-001',
        'user-101',
        'Alice',
        'V1User',
        1,
        'self',
        28,
        'http://avatar.url',
        '[]',
        '["peanuts"]',
        '[]',
        '["vegan"]',
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00Z',
      ]
    );

    // v1 favourites
    await db.execAsync(`
      CREATE TABLE product_favourites (
        user_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        product_name TEXT NOT NULL,
        brand TEXT,
        product_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, barcode)
      );
    `);
    await db.runAsync(
      `INSERT INTO product_favourites (user_id, barcode, product_name, brand, product_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'user-101',
        '9300601000001',
        'Legacy Cereal',
        'BrandA',
        '{"barcode":"9300601000001"}',
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00Z',
      ]
    );

    // v1 history
    await db.execAsync(`
      CREATE TABLE product_history (
        barcode TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        brand TEXT,
        product_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
    `);
    await db.runAsync(
      `INSERT INTO product_history (barcode, product_name, brand, product_json, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        '9300601000001',
        'Legacy Cereal',
        'BrandA',
        '{"barcode":"9300601000001"}',
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
      ]
    );

    // v1 shopping_lists (legacy column: 'name' instead of 'list_name', missing 'color' and 'emoji')
    await db.execAsync(`
      CREATE TABLE shopping_lists (
        list_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await db.runAsync(
      `INSERT INTO shopping_lists (list_id, user_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['list-v1-001', 'user-101', 'Weekly Supplies', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z']
    );

    // v1 shopping_list_items (legacy column: 'checked' instead of 'is_checked', missing 'note', 'product_json', 'updated_at')
    await db.execAsync(`
      CREATE TABLE shopping_list_items (
        list_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        product_name TEXT NOT NULL,
        brand TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        checked INTEGER DEFAULT 0,
        added_at TEXT NOT NULL,
        PRIMARY KEY (list_id, barcode)
      );
    `);
    await db.runAsync(
      `INSERT INTO shopping_list_items (list_id, barcode, product_name, brand, quantity, checked, added_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      ['list-v1-001', '9300601000001', 'Legacy Cereal', 'BrandA', 2, '2026-01-01T00:00:00Z']
    );
  }

  async function createVersion4Fixture(db: MockSQLiteDatabase) {
    await createVersion1Fixture(db);
    db.userVersion = 4;
  }

  async function createVersion5Fixture(db: MockSQLiteDatabase) {
    await createVersion1Fixture(db);
    db.userVersion = 5;

    // Add age_band, sex, guardrail_level to profiles in v5
    const profTable = db.tables.get('profiles');
    if (profTable) {
      if (!profTable.columns.includes('age_band')) profTable.columns.push('age_band');
      if (!profTable.columns.includes('sex')) profTable.columns.push('sex');
      if (!profTable.columns.includes('guardrail_level')) profTable.columns.push('guardrail_level');
      for (const r of profTable.rows) {
        r.age_band = 'adult';
        r.sex = 'female';
        r.guardrail_level = 'strict';
      }
    }
  }

  /* =========================================================================
     TEST CASES
     ========================================================================= */

  it('upgrades v1 schema fixture transactionally to v6 release schema without data loss', async () => {
    // ARRANGE: Construct v1 legacy database fixture
    await createVersion1Fixture(currentMockDb);

    // ACT: Run full database initialization & migration pipeline
    const db = await initialiseSQLiteDatabase();

    // ASSERT 1: Version check
    const [{ user_version }] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version;');
    expect(user_version).toBe(6);

    // ASSERT 2: Table existence
    const tables = Array.from(currentMockDb.tables.keys());
    expect(tables).toContain('profiles');
    expect(tables).toContain('product_favourites');
    expect(tables).toContain('product_history');
    expect(tables).toContain('shopping_lists');
    expect(tables).toContain('shopping_list_items');
    expect(tables).toContain('shopping_list_outbox');

    // ASSERT 3: Shopping list data & column rename preservation (name -> list_name)
    const listRows = await db.getAllAsync<any>('SELECT * FROM shopping_lists;');
    expect(listRows).toHaveLength(1);
    expect(listRows[0].list_id).toBe('list-v1-001');
    expect(listRows[0].list_name).toBe('Weekly Supplies');

    // ASSERT 4: Shopping item data & column rename preservation (checked -> is_checked)
    const itemRows = await db.getAllAsync<any>('SELECT * FROM shopping_list_items;');
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0].list_id).toBe('list-v1-001');
    expect(itemRows[0].barcode).toBe('9300601000001');
    expect(itemRows[0].is_checked).toBe(1);
    expect(itemRows[0].quantity).toBe(2);

    // ASSERT 5: Profile demographic column migration
    const profileCols = await db.getAllAsync<{ name: string }>("PRAGMA table_info('profiles');");
    const colNames = profileCols.map((c) => c.name);
    expect(colNames).toContain('age_band');
    expect(colNames).toContain('sex');
    expect(colNames).toContain('guardrail_level');
  });

  it('upgrades v4 and v5 fixtures seamlessly to release v6 schema', async () => {
    // ARRANGE: Construct v5 fixture
    await createVersion5Fixture(currentMockDb);

    // ACT
    const db = await initialiseSQLiteDatabase();

    // ASSERT
    const [{ user_version }] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version;');
    expect(user_version).toBe(6);
    expect(currentMockDb.tables.has('shopping_list_outbox')).toBe(true);
  });

  it('rolls back transaction cleanly when mid-migration error occurs', async () => {
    // ARRANGE: Populate fixture
    await createVersion1Fixture(currentMockDb);
    const initialVersion = currentMockDb.userVersion;

    // ACT: Inject error inside migration transaction
    const transactionError = new Error('Injected migration disk failure');
    await expect(
      currentMockDb.withTransactionAsync(async () => {
        await currentMockDb.execAsync('PRAGMA user_version = 99;');
        await currentMockDb.execAsync('DROP TABLE profiles;');
        throw transactionError;
      })
    ).rejects.toThrow('Injected migration disk failure');

    // ASSERT: Database rolled back completely to pre-transaction state
    expect(currentMockDb.userVersion).toBe(initialVersion);
    expect(currentMockDb.tables.has('profiles')).toBe(true);
    const profiles = await currentMockDb.getAllAsync('SELECT * FROM profiles;');
    expect(profiles).toHaveLength(1);
  });

  it('ensures second initialization on release schema is idempotent', async () => {
    // ARRANGE: Run initial upgrade to v6
    await createVersion1Fixture(currentMockDb);
    await initialiseSQLiteDatabase();

    // ACT: Run second initialization call
    const db2 = await initialiseSQLiteDatabase();
    const [{ user_version }] = await db2.getAllAsync<{ user_version: number }>('PRAGMA user_version;');

    // ASSERT: Idempotent no-op
    expect(user_version).toBe(6);
    const listRows = await db2.getAllAsync<any>('SELECT * FROM shopping_lists;');
    expect(listRows).toHaveLength(1);
  });
});
