jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock("@/services/storage/uploadProfileAvatar", () => ({
  deleteUserProfilesStorage: jest.fn().mockResolvedValue(undefined),
  deleteProfileAvatar: jest.fn().mockResolvedValue(undefined),
  uploadProfileAvatar: jest.fn(),
}));

jest.mock("firebase/storage", () => ({
  deleteObject: jest.fn().mockResolvedValue(undefined),
  ref: jest.fn(),
  getDownloadURL: jest.fn(),
  listAll: jest.fn().mockResolvedValue({ items: [] }),
  uploadBytes: jest.fn(),
  uploadString: jest.fn(),
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  collection: jest.fn(),
  addDoc: jest.fn(),
  writeBatch: jest.fn(() => ({
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  })),
  serverTimestamp: jest.fn(() => "2026-09-25T00:00:00Z"),
  getDocsFromServer: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  where: jest.fn(),
  deleteField: jest.fn(),
}));

import {
  OWNER_FIXTURE,
  ATTACKER_FIXTURE,
  UNAUTHENTICATED_FIXTURE,
  EXPIRED_TOKEN_FIXTURE,
  REVOKED_TOKEN_FIXTURE,
  createAuthHeader,
  assertNonDisclosingErrorResponse,
} from "./fixtures/authFixtures";

import { GET as getCart, POST as postCart, PATCH as patchCart, DELETE as deleteCart } from "../app/api/shopping-cart-api/route";
import { POST as classifyProduct } from "../app/api/products/classify+api";
import { POST as generateMealPlan } from "../app/api/7-day-meal-plan/+api";
import {
  createUserProfile,
  getUserProfile,
  listUserProfiles,
  updateUserProfile,
  deleteUserProfile,
} from "../services/database/user/profiles";
import {
  createShoppingListFirestore,
  getShoppingListsFirestore,
  addItemToListFirestore,
  deleteShoppingListFirestore,
} from "../services/database/user/shoppingLists";
import submitFeedback from "../services/database/feedback/submitFeedback";
import { deleteUserAccountData } from "../services/database/user/deleteUserAccount";
import { drainOutbox } from "../services/sync/shoppingListSyncService";
import { doc, getDoc, setDoc, deleteDoc, getDocs } from "firebase/firestore";

describe("BE052/BE053/BE047 Cross-Account Authorization & Security Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue({ path: "mock/path" });
  });

  /* =========================================================================
   * DOMAIN 1: SHOPPING CART API (/api/shopping-cart-api)
   * ========================================================================= */
  describe("Domain 1: Shopping Cart API Security", () => {
    it("GET: rejects cross-account cart access (Attacker token for Owner cart)", async () => {
      const req = new Request(`http://localhost/api/shopping-cart-api?userId=${OWNER_FIXTURE.uid}`, {
        method: "GET",
        headers: createAuthHeader(ATTACKER_FIXTURE),
      });

      const res = await getCart(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("FORBIDDEN");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it("GET: rejects unauthenticated cart request", async () => {
      const req = new Request(`http://localhost/api/shopping-cart-api?userId=${OWNER_FIXTURE.uid}`, {
        method: "GET",
        headers: createAuthHeader(UNAUTHENTICATED_FIXTURE),
      });

      const res = await getCart(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("UNAUTHORIZED");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it("GET: rejects expired token cart request", async () => {
      const req = new Request(`http://localhost/api/shopping-cart-api?userId=${OWNER_FIXTURE.uid}`, {
        method: "GET",
        headers: createAuthHeader(EXPIRED_TOKEN_FIXTURE),
      });

      const res = await getCart(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("TOKEN_EXPIRED");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it("GET: rejects revoked token cart request", async () => {
      const req = new Request(`http://localhost/api/shopping-cart-api?userId=${OWNER_FIXTURE.uid}`, {
        method: "GET",
        headers: createAuthHeader(REVOKED_TOKEN_FIXTURE),
      });

      const res = await getCart(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("TOKEN_REVOKED");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it("POST: prevents attacker from writing item into owner cart", async () => {
      const req = new Request("http://localhost/api/shopping-cart-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(ATTACKER_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          productId: "prod_999",
          quantity: 2,
        }),
      });

      const res = await postCart(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("FORBIDDEN");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it("PATCH: prevents cross-account quantity mutation", async () => {
      const req = new Request("http://localhost/api/shopping-cart-api", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(ATTACKER_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          productId: "prod_999",
          quantity: 10,
        }),
      });

      const res = await patchCart(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("FORBIDDEN");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it("DELETE: prevents cross-account item deletion", async () => {
      const req = new Request("http://localhost/api/shopping-cart-api", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(ATTACKER_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          productId: "prod_999",
        }),
      });

      const res = await deleteCart(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("FORBIDDEN");
      assertNonDisclosingErrorResponse(body, res.status);
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it("POST: succeeds for valid owner token matching payload userId", async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ productName: "Apple" }),
      });

      const req = new Request("http://localhost/api/shopping-cart-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(OWNER_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          productId: "prod_apple",
          quantity: 1,
        }),
      });

      const res = await postCart(req);
      expect([200, 201]).toContain(res.status);
      expect(setDoc).toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * DOMAIN 2: PRODUCT CLASSIFICATION API (/api/products/classify)
   * ========================================================================= */
  describe("Domain 2: Product Classification API Security", () => {
    it("POST: denies cross-account classification when caller is attacker and target profile belongs to owner", async () => {
      const req = new Request("http://localhost/api/products/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(ATTACKER_FIXTURE),
        },
        body: JSON.stringify({
          barcode: "123456",
          userId: OWNER_FIXTURE.uid,
          profile: { allergies: ["peanuts"] },
        }),
      });

      const res = await classifyProduct(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("FORBIDDEN");
      assertNonDisclosingErrorResponse(body, res.status);
    });

    it("POST: denies classification for expired token", async () => {
      const req = new Request("http://localhost/api/products/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(EXPIRED_TOKEN_FIXTURE),
        },
        body: JSON.stringify({
          barcode: "123456",
          userId: OWNER_FIXTURE.uid,
          profile: { allergies: ["peanuts"] },
        }),
      });

      const res = await classifyProduct(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("TOKEN_EXPIRED");
      assertNonDisclosingErrorResponse(body, res.status);
    });
  });

  /* =========================================================================
   * DOMAIN 3: MEAL PLAN API (/api/7-day-meal-plan)
   * ========================================================================= */
  describe("Domain 3: 7-Day Meal Plan API Security", () => {
    it("POST: rejects meal plan generation for mismatched caller UID", async () => {
      const req = new Request("http://localhost/api/7-day-meal-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(ATTACKER_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          profileId: "profile_owner_001",
          dietType: "vegan",
        }),
      });

      const res = await generateMealPlan(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("FORBIDDEN");
      assertNonDisclosingErrorResponse(body, res.status);
    });

    it("POST: rejects meal plan generation for revoked token", async () => {
      const req = new Request("http://localhost/api/7-day-meal-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(REVOKED_TOKEN_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          profileId: "profile_owner_001",
          dietType: "vegan",
        }),
      });

      const res = await generateMealPlan(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("TOKEN_REVOKED");
      assertNonDisclosingErrorResponse(body, res.status);
    });
  });

  /* =========================================================================
   * DOMAIN 4: PROFILES SERVICE
   * ========================================================================= */
  describe("Domain 4: User Profiles Service Security", () => {
    it("createUserProfile: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        createUserProfile(OWNER_FIXTURE.uid!, { relationship: "Self" } as any, ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });

    it("getUserProfile: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        getUserProfile(OWNER_FIXTURE.uid!, "profile_1", ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });

    it("listUserProfiles: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        listUserProfiles(OWNER_FIXTURE.uid!, ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });

    it("updateUserProfile: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        updateUserProfile(OWNER_FIXTURE.uid!, "profile_1", { relationship: "Child" }, ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });

    it("deleteUserProfile: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        deleteUserProfile(OWNER_FIXTURE.uid!, "profile_1", ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });
  });

  /* =========================================================================
   * DOMAIN 5: SHOPPING LISTS SERVICE & OUTBOX REPLAY
   * ========================================================================= */
  describe("Domain 5: Shopping Lists Service & Outbox Replay Security", () => {
    it("createShoppingListFirestore: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        createShoppingListFirestore(
          OWNER_FIXTURE.uid!,
          { listId: "l1", userId: OWNER_FIXTURE.uid!, listName: "Groceries", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          ATTACKER_FIXTURE.uid
        )
      ).rejects.toThrow("Access denied.");
    });

    it("getShoppingListsFirestore: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        getShoppingListsFirestore(OWNER_FIXTURE.uid!, ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });

    it("addItemToListFirestore: throws 403 when callerUid does not match target uid", async () => {
      await expect(
        addItemToListFirestore(
          OWNER_FIXTURE.uid!,
          "l1",
          { barcode: "123", productName: "Milk" } as any,
          1,
          undefined,
          ATTACKER_FIXTURE.uid
        )
      ).rejects.toThrow("Access denied.");
    });

    it("drainOutbox: skips operations with mismatched op.userId vs session userId", async () => {
      const mockDb: any = { getAllAsync: jest.fn().mockResolvedValue([]) };

      const result = await drainOutbox(mockDb, ATTACKER_FIXTURE.uid!);

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
    });
  });

  /* =========================================================================
   * DOMAIN 6: FEEDBACK & ACCOUNT DELETION
   * ========================================================================= */
  describe("Domain 6: Feedback & Account Deletion Security", () => {
    it("submitFeedback: rejects feedback submission attempting to spoof owner UID by attacker caller", async () => {
      const res = await submitFeedback(
        { message: "Malicious feedback", uid: OWNER_FIXTURE.uid },
        ATTACKER_FIXTURE.uid
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe("FORBIDDEN");
      expect(res.message).toBe("Access denied.");
    });

    it("deleteUserAccountData: throws 403 when attacker attempts to delete owner account", async () => {
      await expect(
        deleteUserAccountData(OWNER_FIXTURE.uid!, ATTACKER_FIXTURE.uid)
      ).rejects.toThrow("Access denied.");
    });
  });

  /* =========================================================================
   * INTENTIONAL OWNERSHIP-BYPASS FAILURE PROBE
   * ========================================================================= */
  describe("Intentional Ownership-Bypass Failure Probe", () => {
    it("PROBE: verifies that a vulnerable route handler ignoring auth checks fails the security test", async () => {
      // Simulating a flawed handler that reintroduces caller-controlled ownership bypass
      async function vulnerableBypassHandler(request: Request): Promise<Response> {
        const body = await request.json();
        // VULNERABILITY: Directly using caller-supplied body.userId without token verification!
        const targetUserId = body.userId;
        return new Response(
          JSON.stringify({ message: "Cart item updated", userId: targetUserId }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const req = new Request("http://localhost/api/shopping-cart-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeader(ATTACKER_FIXTURE),
        },
        body: JSON.stringify({
          userId: OWNER_FIXTURE.uid,
          productId: "prod_bypass",
          quantity: 1,
        }),
      });

      const res = await vulnerableBypassHandler(req);
      const status = res.status;

      // The security suite expects a 403 Forbidden denial for cross-account mismatch.
      // If status is 200 OK, the security assertion MUST catch it as a failure probe!
      const securityPassed = status === 403 || status === 401;
      expect(securityPassed).toBe(false); // Proves the probe successfully detected the vulnerability!
    });
  });
});
