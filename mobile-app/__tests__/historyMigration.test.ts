describe("BE028 product history migration", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("rebuilds old device-global history rows into the legacy unowned scope", async () => {
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes("PRAGMA user_version")) return [{ user_version: 5 }];
      if (sql.includes("PRAGMA table_info('shopping_lists')")) {
        return [{ name: "list_name" }, { name: "emoji" }];
      }
      if (sql.includes("PRAGMA table_info('shopping_list_items')")) {
        return [
          { name: "is_checked" },
          { name: "updated_at" },
          { name: "product_json" },
          { name: "note" },
        ];
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
          { name: "barcode", pk: 1 },
          { name: "product_name", pk: 0 },
          { name: "brand", pk: 0 },
          { name: "product_json", pk: 0 },
          { name: "created_at", pk: 0 },
          { name: "last_seen_at", pk: 0 },
        ];
      }
      return [];
    });
    const db = {
      execAsync,
      getAllAsync,
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
        await callback();
      }),
    };

    const sqlite = require("expo-sqlite");
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    const { initialiseSQLiteDatabase } = require("../config/sqlConfig");

    await initialiseSQLiteDatabase();

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join("\n");
    expect(executedSql).toContain("PRIMARY KEY (owner_scope, barcode)");
    expect(executedSql).toContain("'legacy:unowned' AS owner_scope");
    expect(executedSql).toContain("ALTER TABLE product_history_new RENAME TO product_history");
    expect(executedSql).toContain("PRAGMA user_version = 6");
  });
});
