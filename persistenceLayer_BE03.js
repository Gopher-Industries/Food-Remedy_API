const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const { buildScanResult } = require("./scanPipeline_BE03");

const db = new sqlite3.Database(path.join(__dirname, "local_cache.db"));

function initLocalDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        allergies TEXT,
        intolerances TEXT,
        avoid_additives TEXT,
        avoid_ingredients TEXT,
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
        added_at TEXT,

        classification TEXT,
        warnings_json TEXT,
        suitability_score INTEGER,
        risk_score INTEGER,
        product_snapshot_json TEXT,

        updated_at TEXT,
        dirty INTEGER DEFAULT 1,
        deleted INTEGER DEFAULT 0
      )
    `);

    migrateShoppingListSchema();
    migrateUserProfileSchema();
  });
}

function migrateUserProfileSchema() {
  db.all(`PRAGMA table_info(user_profiles);`, [], (err, rows) => {
    if (err) return;
    const existing = new Set(rows.map((r) => r.name));
    const addCol = (name, type) => {
      if (existing.has(name)) return;
      db.run(`ALTER TABLE user_profiles ADD COLUMN ${name} ${type};`);
    };

    addCol("intolerances", "TEXT");
    addCol("avoid_ingredients", "TEXT");
  });
}

function migrateShoppingListSchema() {
  db.all(`PRAGMA table_info(shopping_list_items);`, [], (err, rows) => {
    if (err) return;
    const existing = new Set(rows.map((r) => r.name));

    const addCol = (name, type) => {
      if (existing.has(name)) return;
      db.run(`ALTER TABLE shopping_list_items ADD COLUMN ${name} ${type};`);
    };

    addCol("classification", "TEXT");
    addCol("warnings_json", "TEXT");
    addCol("suitability_score", "INTEGER");
    addCol("risk_score", "INTEGER");
    addCol("product_snapshot_json", "TEXT");
    addCol("updated_at", "TEXT");
    addCol("dirty", "INTEGER DEFAULT 1");
    addCol("deleted", "INTEGER DEFAULT 0");
  });
}

function saveUserProfile(profile) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO user_profiles (
        id, name, email, allergies, intolerances, avoid_additives, avoid_ingredients,
        diet_preferences, risk_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        allergies = excluded.allergies,
        intolerances = excluded.intolerances,
        avoid_additives = excluded.avoid_additives,
        avoid_ingredients = excluded.avoid_ingredients,
        diet_preferences = excluded.diet_preferences,
        risk_flags = excluded.risk_flags,
        updated_at = excluded.updated_at
    `,
      [
        profile.id,
        profile.name,
        profile.email,
        JSON.stringify(profile.allergies || []),
        JSON.stringify(profile.intolerances || []),
        JSON.stringify(profile.avoidAdditives || []),
        JSON.stringify(profile.avoidIngredients || []),
        JSON.stringify(profile.dietPreferences || []),
        JSON.stringify(profile.riskFlags || []),
        profile.createdAt,
        profile.updatedAt
      ],
      (err) => {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function getUserProfile(userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM user_profiles WHERE id = ?`, [userId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);

      resolve({
        id: row.id,
        name: row.name,
        email: row.email,
        allergies: JSON.parse(row.allergies || "[]"),
        intolerances: JSON.parse(row.intolerances || "[]"),
        avoidAdditives: JSON.parse(row.avoid_additives || "[]"),
        avoidIngredients: JSON.parse(row.avoid_ingredients || "[]"),
        dietPreferences: JSON.parse(row.diet_preferences || "[]"),
        riskFlags: JSON.parse(row.risk_flags || "[]"),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    });
  });
}

async function addShoppingItemEnriched(input) {
  const userId = input.userId;
  const profile = await getUserProfile(userId);

  const rawProduct = {
    productName: input.productName,
    barcode: input.barcode || null,
    ingredientsText: input.ingredientsText || input.ingredients || "",
    additivesText: input.additivesText || input.additives || "",
    allergensText: input.allergensText || input.allergens || "",
    nutrition: input.nutrition || {}
  };

  const scan = buildScanResult(rawProduct, profile || {});
  const now = new Date().toISOString();

  const dbItem = {
    id: input.id,
    userId,
    productName: scan.product.productName,
    barcode: scan.product.barcode,
    quantity: typeof input.quantity === "number" ? input.quantity : 1,
    checked: !!input.checked,
    addedAt: input.addedAt || now,

    classification: scan.classification,
    warningsJson: JSON.stringify(scan.warnings || []),
    suitabilityScore: scan.suitability?.suitabilityScore ?? 0,
    riskScore: scan.suitability?.riskScore ?? 0,
    productSnapshotJson: JSON.stringify(scan.product),

    updatedAt: now,
    dirty: 1,
    deleted: 0
  };

  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO shopping_list_items (
        id, user_id, product_name, barcode, quantity, checked, added_at,
        classification, warnings_json, suitability_score, risk_score, product_snapshot_json,
        updated_at, dirty, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        product_name = excluded.product_name,
        barcode = excluded.barcode,
        quantity = excluded.quantity,
        checked = excluded.checked,
        classification = excluded.classification,
        warnings_json = excluded.warnings_json,
        suitability_score = excluded.suitability_score,
        risk_score = excluded.risk_score,
        product_snapshot_json = excluded.product_snapshot_json,
        updated_at = excluded.updated_at,
        dirty = excluded.dirty,
        deleted = excluded.deleted
    `,
      [
        dbItem.id,
        dbItem.userId,
        dbItem.productName,
        dbItem.barcode,
        dbItem.quantity,
        dbItem.checked ? 1 : 0,
        dbItem.addedAt,
        dbItem.classification,
        dbItem.warningsJson,
        dbItem.suitabilityScore,
        dbItem.riskScore,
        dbItem.productSnapshotJson,
        dbItem.updatedAt,
        dbItem.dirty,
        dbItem.deleted
      ],
      (err) => {
        if (err) return reject(err);
        resolve(dbItem);
      }
    );
  });
}

function getShoppingList(userId, options = {}) {
  const { classification, onlyChecked, sortBy } = options;

  return new Promise((resolve, reject) => {
    const clauses = ["user_id = ?", "deleted = 0"];
    const params = [userId];

    if (classification) {
      clauses.push("classification = ?");
      params.push(classification);
    }

    if (typeof onlyChecked === "boolean") {
      clauses.push("checked = ?");
      params.push(onlyChecked ? 1 : 0);
    }

    let orderBy = "added_at DESC";
    if (sortBy === "risk") {
      orderBy = `
        CASE classification
          WHEN 'red' THEN 0
          WHEN 'grey' THEN 1
          WHEN 'green' THEN 2
          ELSE 3
        END ASC,
        risk_score DESC,
        added_at DESC
      `;
    } else if (sortBy === "updated") {
      orderBy = "updated_at DESC";
    }

    db.all(
      `SELECT * FROM shopping_list_items WHERE ${clauses.join(" AND ")} ORDER BY ${orderBy}`,
      params,
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
            addedAt: row.added_at,

            classification: row.classification || null,
            warnings: (() => {
              try { return JSON.parse(row.warnings_json || "[]"); } catch { return []; }
            })(),
            suitabilityScore: typeof row.suitability_score === "number" ? row.suitability_score : 0,
            riskScore: typeof row.risk_score === "number" ? row.risk_score : 0,
            productSnapshot: (() => {
              try { return JSON.parse(row.product_snapshot_json || "null"); } catch { return null; }
            })(),

            updatedAt: row.updated_at || row.added_at,
            dirty: row.dirty === 1,
            deleted: row.deleted === 1
          }))
        );
      }
    );
  });
}

function updateShoppingItem(itemId, updates) {
  return new Promise((resolve, reject) => {
    const newQuantity = typeof updates.quantity === "number" ? updates.quantity : null;
    const newChecked = typeof updates.checked === "boolean" ? (updates.checked ? 1 : 0) : null;

    db.run(
      `
      UPDATE shopping_list_items
      SET
        quantity = COALESCE(?, quantity),
        checked  = COALESCE(?, checked),
        updated_at = ?,
        dirty = 1
      WHERE id = ? AND deleted = 0
    `,
      [newQuantity, newChecked, new Date().toISOString(), itemId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function deleteShoppingItem(itemId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE shopping_list_items
      SET deleted = 1, dirty = 1, updated_at = ?
      WHERE id = ?
    `,
      [new Date().toISOString(), itemId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

initLocalDb();

module.exports = {
  saveUserProfile,
  getUserProfile,
  addShoppingItemEnriched,
  getShoppingList,
  updateShoppingItem,
  deleteShoppingItem
};
