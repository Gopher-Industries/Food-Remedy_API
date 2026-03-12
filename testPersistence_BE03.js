const {
  saveUserProfile,
  getUserProfile,
  addShoppingItemEnriched,
  getShoppingList,
  updateShoppingItem,
  deleteShoppingItem
} = require("./persistenceLayer_BE03");

async function test() {
  const user = {
    id: "user-1",
    name: "Diya",
    email: "diya@example.com",
    allergies: ["milk"],
    avoidAdditives: ["621"],
    dietPreferences: ["vegan"],
    riskFlags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log("Saving profile (user-1)...");
  await saveUserProfile(user);

  const profile = await getUserProfile("user-1");
  console.log("Profile loaded:", profile);

  console.log("\nAdding enriched shopping item...");
  const item1 = await addShoppingItemEnriched({
    id: "item-100",
    userId: "user-1",
    productName: "Milk Chocolate",
    barcode: "12345",
    ingredientsText: "Milk, Cocoa, Sugar",
    additivesText: "621",
    allergensText: "milk",
    nutrition: { sugarG: 25 },
    quantity: 1,
    checked: false,
    addedAt: new Date().toISOString()
  });

  console.log("Saved item:", item1);

  let list = await getShoppingList("user-1", { sortBy: "risk" });
  console.log("\nShopping list (sorted by risk):", list);

  console.log("\nFiltering only GREEN items...");
  const greens = await getShoppingList("user-1", { classification: "green", sortBy: "risk" });
  console.log("Green items:", greens);

  console.log("\nUpdating item...");
  await updateShoppingItem("item-100", { quantity: 3, checked: true });

  list = await getShoppingList("user-1", { sortBy: "updated" });
  console.log("\nShopping list after update:", list);

  console.log("\nDeleting item...");
  await deleteShoppingItem("item-100");

  list = await getShoppingList("user-1");
  console.log("\nShopping list after delete:", list);


  const user2 = {
    id: "user-2",
    name: "NoProfile",
    email: "nop@example.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log("\nSaving profile (user-2) missing info...");
  await saveUserProfile(user2);

  console.log("\nAdding enriched item for user-2 (should be GREY)...");
  await addShoppingItemEnriched({
    id: "item-200",
    userId: "user-2",
    productName: "Plain Oats",
    barcode: "99999",
    ingredientsText: "Oats",
    additivesText: "",
    allergensText: "",
    nutrition: { sugarG: 1 },
    quantity: 1,
    checked: false,
    addedAt: new Date().toISOString()
  });

  const list2 = await getShoppingList("user-2", { sortBy: "risk" });
  console.log("\nUser-2 shopping list:", list2);

  console.log("\n✅ BE03 tests finished.");
}

test().catch((e) => console.error("Test failed:", e));
