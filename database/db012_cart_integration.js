/**
 * DB012 — local cart / shopping-list integration (SQLite persistence layer).
 *
 * Simulates: scan/add-to-cart with a Firestore-shaped product payload mapped into
 * addShoppingItemEnriched, then list + snapshot checks (fields the app uses).
 *
 * Run: node database/db012_cart_integration.js
 * Or:  npm run test:db012:cart
 */
const {
  saveUserProfile,
  getUserProfile,
  addShoppingItemEnriched,
  getShoppingList,
  deleteShoppingItem
} = require("../persistenceLayer_BE03");

const USER_ID = "db012-cart-user";
const ITEM_ORIGINAL = "db012-item-original";
const ITEM_RECOMMENDED = "db012-item-recommended";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Map nutriments / grade from a typical seeded product doc into scan pipeline input. */
function firestoreProductToCartInput(doc, overrides) {
  const nutriments = doc.nutriments || {};
  const sugarG =
    typeof nutriments.sugars_100g === "number"
      ? nutriments.sugars_100g
      : typeof nutriments.sugars_serving === "number"
        ? nutriments.sugars_serving
        : null;

  return {
    id: overrides.id,
    userId: USER_ID,
    productName: doc.productName || "Unknown",
    barcode: String(doc.barcode || ""),
    ingredientsText: doc.ingredientsText || "",
    additivesText: Array.isArray(doc.additives) ? doc.additives.join(", ") : "",
    allergensText: Array.isArray(doc.allergens) ? doc.allergens.join(", ") : "",
    nutrition: { sugarG: sugarG ?? 0 },
    quantity: 1,
    checked: false,
    addedAt: new Date().toISOString()
  };
}

async function run() {
  const now = new Date().toISOString();
  await saveUserProfile({
    id: USER_ID,
    name: "DB012 Tester",
    email: "db012@example.com",
    allergies: ["milk"],
    avoidAdditives: [],
    dietPreferences: [],
    riskFlags: [],
    createdAt: now,
    updatedAt: now
  });

  const profile = await getUserProfile(USER_ID);
  assert(profile && profile.id === USER_ID, "Profile should load");

  for (const id of [ITEM_ORIGINAL, ITEM_RECOMMENDED]) {
    await deleteShoppingItem(id).catch(() => {});
  }

  const originalDoc = {
    barcode: "db012-demo-original",
    productName: "Sugar-heavy demo bar",
    ingredientsText: "sugar, milk powder, cocoa",
    additives: [],
    allergens: ["milk"],
    nutriments: { sugars_100g: 45 },
    nutriscoreGrade: "e"
  };

  const recommendedDoc = {
    barcode: "db012-demo-recommended",
    productName: "Lower sugar demo bar",
    ingredientsText: "oats, cocoa, salt",
    additives: [],
    allergens: [],
    nutriments: { sugars_100g: 5 },
    nutriscoreGrade: "a"
  };

  await addShoppingItemEnriched(firestoreProductToCartInput(originalDoc, { id: ITEM_ORIGINAL }));
  await addShoppingItemEnriched(
    firestoreProductToCartInput(recommendedDoc, { id: ITEM_RECOMMENDED })
  );

  const list = await getShoppingList(USER_ID, { sortBy: "risk" });
  assert(list.length >= 2, "Cart should contain at least two items");

  const byId = Object.fromEntries(list.map((i) => [i.id, i]));
  const orig = byId[ITEM_ORIGINAL];
  const rec = byId[ITEM_RECOMMENDED];

  assert(orig && orig.productSnapshot, "Original item should have productSnapshot");
  assert(rec && rec.productSnapshot, "Recommended item should have productSnapshot");

  assert(
    orig.productSnapshot.barcode === originalDoc.barcode,
    "Snapshot barcode should match original doc"
  );
  assert(
    rec.productSnapshot.barcode === recommendedDoc.barcode,
    "Snapshot barcode should match recommended doc"
  );
  assert(
    typeof orig.productSnapshot.nutrition?.sugarG === "number",
    "Snapshot should carry nutrition.sugarG from nutriments"
  );

  console.log("DB012 cart integration: PASS");
  console.log("  items:", list.map((i) => ({ id: i.id, name: i.productName, classification: i.classification })));

  for (const id of [ITEM_ORIGINAL, ITEM_RECOMMENDED]) {
    await deleteShoppingItem(id);
  }
}

run().catch((e) => {
  console.error("DB012 cart integration: FAIL\n", e.message || e);
  process.exit(1);
});
