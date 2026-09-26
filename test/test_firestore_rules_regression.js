/**
 * BE014 - Firestore Rules Emulator Regression Coverage
 *
 * PURPOSE:
 * This test file verifies the Firestore Security Rules used by the
 * release-critical backend Firestore paths in Food Remedy.
 *
 * Repository paths covered:
 *
 * 1. USERS/{uid}/PROFILES/{profileId}
 *    Used by syncProfilesServices.ts
 *
 * 2. USERS/{uid}/SHOPPING_LISTS/{listId}
 *    Used by shoppingLists.ts
 *
 * 3. USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}
 *    Used by shoppingLists.ts
 *
 * The tests verify:
 * - a signed-in user can access their own data;
 * - another user cannot access that user's private data;
 * - an unauthenticated user cannot access private user data;
 * - all testing runs against the local Firestore Emulator only.
 */

const fs = require("fs");

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

const {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} = require("firebase/firestore");

const { before, after, beforeEach, describe, test } = require("node:test");

let testEnv;

const PROJECT_ID = "demo-food-remedy-be014";
const OWNER_UID = "userA";
const OTHER_UID = "userB";


// ==========================================================
// TEST SETUP
// ==========================================================

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,

    firestore: {
      host: "127.0.0.1",
      port: 8080,

      // Always load the repository rules directly for this test suite.
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});


beforeEach(async () => {
  // Start every test with an empty emulator database.
  await testEnv.clearFirestore();
});


after(async () => {
  // Close emulator test connections when testing is complete.
  await testEnv.cleanup();
});


// ==========================================================
// HELPER FUNCTIONS
// ==========================================================

async function seedDocument(path, data) {
  /**
   * Test setup data is inserted with Security Rules disabled.
   *
   * This ensures that creating fixture data does not affect whether
   * the operation being tested is allowed or denied.
   */
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}


// ==========================================================
// PROFILE SECURITY RULES
// ==========================================================

describe("Profile Firestore rules", () => {

  test("owner can create their own profile", async () => {
    // ARRANGE
    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    const profileRef = doc(
      ownerDb,
      "USERS",
      OWNER_UID,
      "PROFILES",
      "profile1"
    );

    // ACT + ASSERT
    await assertSucceeds(
      setDoc(profileRef, {
        profileId: "profile1",
        firstName: "Test User",
        updated_at: "2026-08-10T00:00:00.000Z",
      })
    );
  });


  test("owner can read their own profile collection", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/PROFILES/profile1`,
      {
        profileId: "profile1",
        firstName: "Test User",
      }
    );

    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    // ACT + ASSERT
    await assertSucceeds(
      getDocs(
        collection(
          ownerDb,
          "USERS",
          OWNER_UID,
          "PROFILES"
        )
      )
    );
  });


  test("another user cannot read someone else's profile", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/PROFILES/profile1`,
      {
        profileId: "profile1",
        firstName: "Private Profile",
      }
    );

    const otherDb = testEnv
      .authenticatedContext(OTHER_UID)
      .firestore();

    const profileRef = doc(
      otherDb,
      "USERS",
      OWNER_UID,
      "PROFILES",
      "profile1"
    );

    // ACT + ASSERT
    await assertFails(
      getDoc(profileRef)
    );
  });


  test("another user cannot modify someone else's profile", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/PROFILES/profile1`,
      {
        profileId: "profile1",
        firstName: "Original Name",
      }
    );

    const otherDb = testEnv
      .authenticatedContext(OTHER_UID)
      .firestore();

    const profileRef = doc(
      otherDb,
      "USERS",
      OWNER_UID,
      "PROFILES",
      "profile1"
    );

    // ACT + ASSERT
    await assertFails(
      updateDoc(profileRef, {
        firstName: "Changed By Another User",
      })
    );
  });


  test("unauthenticated user cannot read a profile", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/PROFILES/profile1`,
      {
        profileId: "profile1",
      }
    );

    const unauthenticatedDb = testEnv
      .unauthenticatedContext()
      .firestore();

    // ACT + ASSERT
    await assertFails(
      getDoc(
        doc(
          unauthenticatedDb,
          "USERS",
          OWNER_UID,
          "PROFILES",
          "profile1"
        )
      )
    );
  });

});


// ==========================================================
// SHOPPING LIST SECURITY RULES
// ==========================================================

describe("Shopping List Firestore rules", () => {

  test("owner can create their own shopping list", async () => {
    // ARRANGE
    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    const listRef = doc(
      ownerDb,
      "USERS",
      OWNER_UID,
      "SHOPPING_LISTS",
      "list1"
    );

    // ACT + ASSERT
    await assertSucceeds(
      setDoc(listRef, {
        listId: "list1",
        userId: OWNER_UID,
        listName: "Groceries",
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z",
      })
    );
  });


  test("owner can read their own shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1`,
      {
        listId: "list1",
        userId: OWNER_UID,
        listName: "Groceries",
      }
    );

    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    // ACT + ASSERT
    await assertSucceeds(
      getDoc(
        doc(
          ownerDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1"
        )
      )
    );
  });


  test("owner can update their own shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1`,
      {
        listId: "list1",
        userId: OWNER_UID,
        listName: "Groceries",
      }
    );

    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    // ACT + ASSERT
    await assertSucceeds(
      updateDoc(
        doc(
          ownerDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1"
        ),
        {
          listName: "Updated Groceries",
        }
      )
    );
  });


  test("another user cannot read someone else's shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1`,
      {
        listId: "list1",
        userId: OWNER_UID,
        listName: "Private List",
      }
    );

    const otherDb = testEnv
      .authenticatedContext(OTHER_UID)
      .firestore();

    // ACT + ASSERT
    await assertFails(
      getDoc(
        doc(
          otherDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1"
        )
      )
    );
  });


  test("another user cannot modify someone else's shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1`,
      {
        listId: "list1",
        userId: OWNER_UID,
        listName: "Private List",
      }
    );

    const otherDb = testEnv
      .authenticatedContext(OTHER_UID)
      .firestore();

    // ACT + ASSERT
    await assertFails(
      updateDoc(
        doc(
          otherDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1"
        ),
        {
          listName: "Unauthorized Change",
        }
      )
    );
  });


  test("unauthenticated user cannot create a shopping list", async () => {
    // ARRANGE
    const unauthenticatedDb = testEnv
      .unauthenticatedContext()
      .firestore();

    // ACT + ASSERT
    await assertFails(
      setDoc(
        doc(
          unauthenticatedDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1"
        ),
        {
          listId: "list1",
          userId: OWNER_UID,
          listName: "Unauthorised List",
        }
      )
    );
  });

});


// ==========================================================
// SHOPPING LIST ITEM SECURITY RULES
// ==========================================================

describe("Shopping List Item Firestore rules", () => {

  test("owner can create an item in their own shopping list", async () => {
    // ARRANGE
    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    const itemRef = doc(
      ownerDb,
      "USERS",
      OWNER_UID,
      "SHOPPING_LISTS",
      "list1",
      "ITEMS",
      "9300675000143"
    );

    // ACT + ASSERT
    await assertSucceeds(
      setDoc(itemRef, {
        listId: "list1",
        barcode: "9300675000143",
        productName: "Test Product",
        quantity: 1,
      })
    );
  });


  test("owner can read items from their own shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1/ITEMS/9300675000143`,
      {
        listId: "list1",
        barcode: "9300675000143",
        quantity: 1,
      }
    );

    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    // ACT + ASSERT
    await assertSucceeds(
      getDocs(
        collection(
          ownerDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1",
          "ITEMS"
        )
      )
    );
  });


  test("owner can delete an item from their own shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1/ITEMS/9300675000143`,
      {
        listId: "list1",
        barcode: "9300675000143",
      }
    );

    const ownerDb = testEnv
      .authenticatedContext(OWNER_UID)
      .firestore();

    // ACT + ASSERT
    await assertSucceeds(
      deleteDoc(
        doc(
          ownerDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1",
          "ITEMS",
          "9300675000143"
        )
      )
    );
  });


  test("another user cannot modify an item in someone else's shopping list", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1/ITEMS/9300675000143`,
      {
        listId: "list1",
        barcode: "9300675000143",
        quantity: 1,
      }
    );

    const otherDb = testEnv
      .authenticatedContext(OTHER_UID)
      .firestore();

    // ACT + ASSERT
    await assertFails(
      updateDoc(
        doc(
          otherDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1",
          "ITEMS",
          "9300675000143"
        ),
        {
          quantity: 99,
        }
      )
    );
  });


  test("unauthenticated user cannot read shopping list items", async () => {
    // ARRANGE
    await seedDocument(
      `USERS/${OWNER_UID}/SHOPPING_LISTS/list1/ITEMS/9300675000143`,
      {
        barcode: "9300675000143",
      }
    );

    const unauthenticatedDb = testEnv
      .unauthenticatedContext()
      .firestore();

    // ACT + ASSERT
    await assertFails(
      getDoc(
        doc(
          unauthenticatedDb,
          "USERS",
          OWNER_UID,
          "SHOPPING_LISTS",
          "list1",
          "ITEMS",
          "9300675000143"
        )
      )
    );
  });

});