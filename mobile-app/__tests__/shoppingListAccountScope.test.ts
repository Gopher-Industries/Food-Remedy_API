import {
  addItemToList,
  clearAllItems,
  clearCheckedItems,
  clearShoppingListsForUser,
  deleteShoppingList,
  getItemInList,
  getListItems,
  getShoppingList,
  removeItemFromList,
  toggleItemChecked,
  updateItemNote,
  updateItemQuantity,
  updateShoppingList,
  upsertShoppingList,
} from "@/services/sqlDatabase/shoppingList.dao";
import { loadOwnedShoppingListState } from "@/services/sqlDatabase/shoppingListState";

const OWNER = "account-a";
const FOREIGN = "account-b";
const LIST_ID = "list-a";
const BARCODE = "9300000000001";

const listRow = {
  list_id: LIST_ID,
  user_id: OWNER,
  list_name: "Owner list",
  color: null,
  emoji: null,
  created_at: "2026-09-27T00:00:00.000Z",
  updated_at: "2026-09-27T00:00:00.000Z",
};

const itemRow = {
  list_id: LIST_ID,
  barcode: BARCODE,
  product_name: "Scoped oats",
  brand: "Food Remedy",
  quantity: 1,
  note: null,
  is_checked: 0,
  product_json: JSON.stringify({ barcode: BARCODE, productName: "Scoped oats" }),
  added_at: "2026-09-27T00:00:00.000Z",
  updated_at: "2026-09-27T00:00:00.000Z",
};

const product = {
  barcode: BARCODE,
  productName: "Scoped oats",
  brand: "Food Remedy",
};

function mockDb(owned: boolean) {
  return {
    getFirstAsync: jest.fn().mockResolvedValue(owned ? { owned: 1 } : null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  };
}

describe("BE071 account-scoped shopping-list persistence", () => {
  it("allows the owner to read a list", async () => {
    const db = mockDb(true);
    db.getAllAsync.mockResolvedValueOnce([listRow]);

    await expect(getShoppingList(db as any, OWNER, LIST_ID)).resolves.toMatchObject({
      listId: LIST_ID,
      userId: OWNER,
    });
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE list_id = ? AND user_id = ?"),
      [LIST_ID, OWNER]
    );
  });

  it("does not return a foreign account's list or items", async () => {
    const db = mockDb(false);

    await expect(getShoppingList(db as any, FOREIGN, LIST_ID)).resolves.toBeNull();
    await expect(getListItems(db as any, FOREIGN, LIST_ID)).resolves.toEqual([]);
    await expect(getItemInList(db as any, FOREIGN, LIST_ID, BARCODE)).resolves.toBeNull();

    expect(db.getAllAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("user_id = ?"),
      [LIST_ID, FOREIGN]
    );
    expect(db.getAllAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("JOIN shopping_lists"),
      [LIST_ID, FOREIGN]
    );
    expect(db.getAllAsync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("JOIN shopping_lists"),
      [LIST_ID, BARCODE, FOREIGN]
    );
  });

  it("prevents a foreign account from updating a list", async () => {
    const db = mockDb(false);
    await expect(updateShoppingList(db as any, FOREIGN, LIST_ID, { listName: "Taken" }))
      .resolves.toBe(false);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("prevents a foreign account from deleting a list", async () => {
    const db = mockDb(false);
    await expect(deleteShoppingList(db as any, FOREIGN, LIST_ID)).resolves.toBe(false);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("prevents a foreign account from inserting an item", async () => {
    const db = mockDb(false);
    await expect(addItemToList(db as any, FOREIGN, LIST_ID, product as any))
      .resolves.toBe(false);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("does not transfer an existing list to another account during cloud upsert", async () => {
    const db = mockDb(false);
    await upsertShoppingList(db as any, {
      listId: LIST_ID,
      userId: FOREIGN,
      listName: "Foreign collision",
      createdAt: listRow.created_at,
      updatedAt: listRow.updated_at,
    });

    const [sql] = db.runAsync.mock.calls[0];
    expect(sql).toContain("WHERE shopping_lists.user_id = excluded.user_id");
    expect(sql).not.toMatch(/SET\s+user_id\s*=\s*excluded\.user_id/);
  });

  it.each([
    ["change quantity", (db: any) => updateItemQuantity(db, FOREIGN, LIST_ID, BARCODE, 2)],
    ["change notes", (db: any) => updateItemNote(db, FOREIGN, LIST_ID, BARCODE, "private")],
    ["remove an item", (db: any) => removeItemFromList(db, FOREIGN, LIST_ID, BARCODE)],
    ["clear checked items", (db: any) => clearCheckedItems(db, FOREIGN, LIST_ID)],
    ["clear a list", (db: any) => clearAllItems(db, FOREIGN, LIST_ID)],
  ])("prevents a foreign account from attempting to %s", async (_name, operation) => {
    const db = mockDb(false);
    await expect(operation(db as any)).resolves.toBe(false);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("prevents a foreign account from toggling checked state", async () => {
    const db = mockDb(false);
    db.getAllAsync.mockResolvedValueOnce([]);
    await expect(toggleItemChecked(db as any, FOREIGN, LIST_ID, BARCODE)).resolves.toBeNull();
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("retains normal CRUD behaviour for the owner", async () => {
    const db = mockDb(true);
    db.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT i.quantity")) return [];
      if (sql.includes("SELECT i.is_checked")) return [{ is_checked: 0 }];
      if (sql.includes("FROM shopping_list_items i")) return [itemRow];
      return [];
    });

    await expect(updateShoppingList(db as any, OWNER, LIST_ID, { listName: "Updated" }))
      .resolves.toBe(true);
    await expect(addItemToList(db as any, OWNER, LIST_ID, product as any, 1))
      .resolves.toBe(true);
    await expect(updateItemQuantity(db as any, OWNER, LIST_ID, BARCODE, 2)).resolves.toBe(true);
    await expect(updateItemNote(db as any, OWNER, LIST_ID, BARCODE, "Buy two")).resolves.toBe(true);
    await expect(toggleItemChecked(db as any, OWNER, LIST_ID, BARCODE)).resolves.toBe(true);
    await expect(removeItemFromList(db as any, OWNER, LIST_ID, BARCODE)).resolves.toBe(true);
    await expect(clearCheckedItems(db as any, OWNER, LIST_ID)).resolves.toBe(true);
    await expect(clearAllItems(db as any, OWNER, LIST_ID)).resolves.toBe(true);
    await expect(deleteShoppingList(db as any, OWNER, LIST_ID)).resolves.toBe(true);

    for (const [sql, params] of db.runAsync.mock.calls) {
      expect(sql).toMatch(/user_id = \?|EXISTS \(SELECT 1 FROM shopping_lists/);
      expect(params).toContain(OWNER);
    }
  });

  it("BE073: clears only the deleted account's shopping lists (items cascade via FK)", async () => {
    const db = mockDb(true);

    await clearShoppingListsForUser(db as any, OWNER);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM shopping_lists WHERE user_id = ?"),
      [OWNER]
    );
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.anything(), [FOREIGN]);
  });

  it("clears stale React state when the requested list is foreign or missing", async () => {
    const db = mockDb(false);
    db.getAllAsync.mockResolvedValueOnce([]);
    const setCurrentList = jest.fn();
    const setCurrentItems = jest.fn();

    await expect(loadOwnedShoppingListState(
      db as any, FOREIGN, LIST_ID, setCurrentList, setCurrentItems
    )).resolves.toBe(false);

    expect(setCurrentList).toHaveBeenCalledWith(null);
    expect(setCurrentItems).toHaveBeenCalledWith([]);
  });
});
