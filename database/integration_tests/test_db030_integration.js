const assert = require("assert");
const path = require("path");

const persistence = require("../local_backend/persistenceLayer");
const scanPipeline = require("../local_backend/scanPipeline");

async function testUserProfilePersistence() {
  console.log("\n[DB030] Testing User Profile Persistence...");

  const profile = {
    id: "db030-user-001",
    name: "Integration Test User",
    email: "integration@test.com",
    allergies: ["milk"],
    avoidAdditives: ["621"],
    dietPreferences: ["vegan", "glutenFree"],
    riskFlags: ["highSugar"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await persistence.saveUserProfile(profile);

  const retrieved = await persistence.getUserProfile(profile.id);

  assert(retrieved !== null);
  assert.strictEqual(retrieved.id, profile.id);
  assert.strictEqual(retrieved.name, profile.name);
  assert.deepStrictEqual(retrieved.allergies, profile.allergies);

  console.log("[PASS] User profile persistence working.");
}

async function testShoppingListPersistence() {
  console.log("\n[DB030] Testing Shopping List Persistence...");

  const item = {
    id: "shopping-item-001",
    userId: "db030-user-001",
    productName: "Dark Chocolate",
    barcode: "99901",
    quantity: 2,
    checked: false,
    addedAt: new Date().toISOString()
  };

  await persistence.addShoppingItem(item);

  const items = await persistence.getShoppingList(item.userId);

  assert(items.length > 0);

  const found = items.find((i) => i.id === item.id);

  assert(found);
  assert.strictEqual(found.productName, item.productName);

  await persistence.updateShoppingItem(item.id, {
    quantity: 5,
    checked: true
  });

  const updatedItems = await persistence.getShoppingList(item.userId);

  const updated = updatedItems.find((i) => i.id === item.id);

  assert.strictEqual(updated.quantity, 5);
  assert.strictEqual(updated.checked, true);

  await persistence.deleteShoppingItem(item.id);

  const afterDelete = await persistence.getShoppingList(item.userId);

  const deleted = afterDelete.find((i) => i.id === item.id);

  assert.strictEqual(deleted, undefined);

  console.log("[PASS] Shopping list persistence working.");
}

async function testScanPipelineIntegration() {
  console.log("\n[DB030] Testing Scan Pipeline Integration...");

  const rawProduct = {
    barcode: "12345",
    productName: "Milk Chocolate",
    ingredientsText: "Milk, Cocoa, Sugar, Wheat flour",
    additivesText: "621",
    nutrition: {
      sugarG: 25
    }
  };

  const userProfile = {
    id: "db030-user-001",
    allergies: ["milk"],
    avoidAdditives: ["621"],
    dietPreferences: ["vegan", "glutenFree"]
  };

  const result = scanPipeline.buildScanResult(
    rawProduct,
    userProfile
  );

  assert(result);
  assert(result.product);
  assert(result.warnings.length > 0);
  assert(result.classification === "red");

  assert(
    result.warnings.some(
      (w) => w.code === "ALLERGEN_MILK"
    )
  );

  assert(
    result.warnings.some(
      (w) => w.code === "ADDITIVE_621"
    )
  );

  console.log("[PASS] Scan pipeline integration working.");
}

async function testOfflineQueueIntegration() {
  console.log("\n[DB030] Testing Offline Queue Integration...");

  const result = {
    metadata: {
      processedAt: new Date().toISOString()
    }
  };

  const saveStatus = scanPipeline.saveScanResult(result);

  assert.strictEqual(saveStatus.saved, false);
  assert.strictEqual(saveStatus.queued, true);

  console.log("[PASS] Offline queue integration working.");
}

async function testConflictResolutionIntegration() {
  console.log("\n[DB030] Testing Conflict Resolution Integration...");

  const localResult = {
    metadata: {
      processedAt: new Date().toISOString()
    }
  };

  const remoteResult = {
    metadata: {
      processedAt: new Date(
        Date.now() - 60000
      ).toISOString()
    }
  };

  const resolved =
    scanPipeline.mergeScanResultWithRemote(
      localResult,
      remoteResult
    );

  assert(resolved);
  assert(resolved.mergedResult);

  console.log("[PASS] Conflict resolution integration working.");
}

async function runAllTests() {
  console.log("\n=======================================");
  console.log("DB030 Integration Testing Started");
  console.log("=======================================");

  await testUserProfilePersistence();

  await testShoppingListPersistence();

  await testScanPipelineIntegration();

  await testOfflineQueueIntegration();

  await testConflictResolutionIntegration();

  console.log("\n=======================================");
  console.log("ALL DB030 INTEGRATION TESTS PASSED");
  console.log("=======================================\n");
}

module.exports = {
  runAllTests
};