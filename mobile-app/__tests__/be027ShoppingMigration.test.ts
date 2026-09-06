function createMigrationDbMock(itemColumns: Array<{ name: string }>) {
  const execAsync = jest.fn().mockResolvedValue(undefined);
  const getAllAsync = jest.fn(async (sql: string) => {
    if (sql.includes("PRAGMA user_version")) return [{ user_version: 5 }];
    if (sql.includes("PRAGMA table_info('shopping_lists')")) {
      return [{ name: "list_name" }, { name: "emoji" }];
    }
    if (sql.includes("PRAGMA table_info('shopping_list_items')")) {
      return itemColumns;
    }
    if (sql.includes("PRAGMA table_info('profiles')")) {
      return [
        { name: "age_band" },
        { name: "sex" },
        { name: "guardrail_level" },
      ];
    }
    if (sql.includes("PRAGMA table_info('product_history')")) {
      return [
        { name: "owner_scope", pk: 1 },
        { name: "barcode", pk: 2 },
        { name: "product_name", pk: 0 },
        { name: "brand", pk: 0 },
        { name: "product_json", pk: 0 },
        { name: "created_at", pk: 0 },
        { name: "last_seen_at", pk: 0 },
      ];
    }
    return [];
  });

  return {
    execAsync,
    getAllAsync,
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
      await callback();
    }),
  };
}

async function initialiseWithMockDb(db: any) {
  jest.resetModules();
  const sqlite = require("expo-sqlite");
  sqlite.openDatabaseAsync.mockResolvedValue(db);

  const { initialiseSQLiteDatabase } = require("../config/sqlConfig");
  await initialiseSQLiteDatabase();
}

describe("BE027 shopping SQLite migration", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("does not add note again after rebuilding old shopping_list_items schema", async () => {
    const db = createMigrationDbMock([
      { name: "list_id" },
      { name: "barcode" },
      { name: "product_name" },
      { name: "brand" },
      { name: "quantity" },
      { name: "checked" },
      { name: "added_at" },
    ]);

    await initialiseWithMockDb(db);

    const executedSql = db.execAsync.mock.calls.map(([sql]: [string]) => sql).join("\n");

    expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS shopping_list_items_new");
    expect(executedSql).toContain("ALTER TABLE shopping_list_items_new RENAME TO shopping_list_items");
    expect(executedSql).not.toContain("ALTER TABLE shopping_list_items ADD COLUMN note TEXT");
  });

  it("adds note when shopping_list_items is otherwise current but note is missing", async () => {
    const db = createMigrationDbMock([
      { name: "list_id" },
      { name: "barcode" },
      { name: "product_name" },
      { name: "brand" },
      { name: "quantity" },
      { name: "is_checked" },
      { name: "product_json" },
      { name: "added_at" },
      { name: "updated_at" },
    ]);

    await initialiseWithMockDb(db);

    const executedSql = db.execAsync.mock.calls.map(([sql]: [string]) => sql).join("\n");

    expect(executedSql).not.toContain("CREATE TABLE IF NOT EXISTS shopping_list_items_new");
    expect(executedSql).toContain("ALTER TABLE shopping_list_items ADD COLUMN note TEXT");
  });

  it("leaves current shopping_list_items schema unchanged", async () => {
    const db = createMigrationDbMock([
      { name: "list_id" },
      { name: "barcode" },
      { name: "product_name" },
      { name: "brand" },
      { name: "quantity" },
      { name: "note" },
      { name: "is_checked" },
      { name: "product_json" },
      { name: "added_at" },
      { name: "updated_at" },
    ]);

    await initialiseWithMockDb(db);

    const executedSql = db.execAsync.mock.calls.map(([sql]: [string]) => sql).join("\n");

    expect(executedSql).not.toContain("CREATE TABLE IF NOT EXISTS shopping_list_items_new");
    expect(executedSql).not.toContain("ALTER TABLE shopping_list_items ADD COLUMN note TEXT");
  });
});
