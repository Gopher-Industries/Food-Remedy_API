const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "local_cache.db"));

function initLocalDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        allergies TEXT,
        avoid_additives TEXT,
        diet_preferences TEXT,
        risk_flags TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        product_name TEXT,
        barcode TEXT,
        quantity INTEGER,
        checked INTEGER,
        added_at TEXT
      )
    `);
  });
}

function saveUserProfile(profile) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO user_profiles (
        id, name, email, allergies, avoid_additives,
        diet_preferences, risk_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        allergies = excluded.allergies,
        avoid_additives = excluded.avoid_additives,
        diet_preferences = excluded.diet_preferences,
        risk_flags = excluded.risk_flags,
        updated_at = excluded.updated_at
    `,
      [
        profile.id,
        profile.name,
        profile.email,
        JSON.stringify(profile.allergies || []),
        JSON.stringify(profile.avoidAdditives || []),
        JSON.stringify(profile.dietPreferences || []),
        JSON.stringify(profile.riskFlags || []),
        profile.createdAt,
        profile.updatedAt
      ],
      (err) => (err ? reject(err) : resolve(profile))
    );
  });
}

function getUserProfile(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM user_profiles WHERE id = ?`,
      [userId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        resolve({
          id: row.id,
          name: row.name,
          email: row.email,
          allergies: JSON.parse(row.allergies),
          avoidAdditives: JSON.parse(row.avoid_additives),
          dietPreferences: JSON.parse(row.diet_preferences),
          riskFlags: JSON.parse(row.risk_flags),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    );
  });
}

function addShoppingItem(item) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO shopping_list_items (
        id, user_id, product_name, barcode, quantity,
        checked, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        item.id,
        item.userId,
        item.productName,
        item.barcode,
        item.quantity,
        item.checked ? 1 : 0,
        item.addedAt
      ],
      (err) => (err ? reject(err) : resolve(item))
    );
  });
}

function getShoppingList(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM shopping_list_items WHERE user_id = ?`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);

        resolve(
          rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            productName: row.product_name,
            barcode: row.barcode,
            quantity: row.quantity,
            checked: row.checked === 1,
            addedAt: row.added_at
          }))
        );
      }
    );
  });
}

// 🔹 NEW: update quantity / checked status
function updateShoppingItem(itemId, updates) {
  return new Promise((resolve, reject) => {
    const newQuantity =
      typeof updates.quantity === "number" ? updates.quantity : null;
    const newChecked =
      typeof updates.checked === "boolean"
        ? updates.checked ? 1 : 0
        : null;

    db.run(
      `
      UPDATE shopping_list_items
      SET
        quantity = COALESCE(?, quantity),
        checked  = COALESCE(?, checked)
      WHERE id = ?
    `,
      [newQuantity, newChecked, itemId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes); // number of rows updated
      }
    );
  });
}

// 🔹 NEW: delete a shopping list item
function deleteShoppingItem(itemId) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM shopping_list_items WHERE id = ?`,
      [itemId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes); // number of rows deleted
      }
    );
  });
}

initLocalDb();

module.exports = {
  saveUserProfile,
  getUserProfile,
  addShoppingItem,
  getShoppingList,
  updateShoppingItem,
  deleteShoppingItem
};
