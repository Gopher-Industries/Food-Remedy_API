const {
  saveUserProfile,
  getUserProfile,
  addShoppingItem,
  getShoppingList,
  updateShoppingItem,
  deleteShoppingItem
} = require("./persistenceLayer");

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

async function test() {
  console.log("Saving profile...");
  await saveUserProfile(user);

  const profile = await getUserProfile("user-1");
  console.log("Profile loaded:", profile);

  console.log("\nAdding shopping item...");
  await addShoppingItem({
    id: "item-100",
    userId: "user-1",
    productName: "Almond Milk",
    barcode: "88888",
    quantity: 1,
    checked: false,
    addedAt: new Date().toISOString()
  });

  let list = await getShoppingList("user-1");
  console.log("\nShopping list after add:", list);

  console.log("\nUpdating shopping item (quantity to 3, checked = true)...");
  await updateShoppingItem("item-100", { quantity: 3, checked: true });

  list = await getShoppingList("user-1");
  console.log("\nShopping list after update:", list);

  console.log("\nDeleting shopping item...");
  await deleteShoppingItem("item-100");

  list = await getShoppingList("user-1");
  console.log("\nShopping list after delete:", list);
}

test();
