jest.mock("@/config/firebaseConfig", () => ({
  fdb: {},
}));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => "mock-timestamp"),
}));

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

import {
  GET,
  POST,
  PATCH,
  DELETE,
} from "@/app/api/shopping-cart-api/route";

describe("Shopping Cart API error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (collection as jest.Mock).mockReturnValue({
      type: "collection-ref",
    });

    (doc as jest.Mock).mockReturnValue({
      type: "doc-ref",
    });
  });

  describe("GET", () => {
    it("returns a consistent validation error when userId is missing", async () => {
      const response = await GET(
        new Request("http://localhost/api/shopping-cart-api")
      );

      const body = await response.json();

      expect(response.status).toBe(400);

      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message: "userId is required.",
      });
    });

    it("sanitizes internal Firestore errors", async () => {
      (getDocs as jest.Mock).mockRejectedValue(
        new Error("Firestore permission denied: internal project details")
      );

      const response = await GET(
        new Request(
          "http://localhost/api/shopping-cart-api?userId=user123"
        )
      );

      const body = await response.json();

      expect(response.status).toBe(500);

      expect(body).toEqual({
        error: "SERVER_ERROR",
        message: "Unable to retrieve cart.",
      });

      expect(JSON.stringify(body)).not.toContain(
        "Firestore permission denied"
      );
    });
  });

  describe("POST", () => {
    it("returns 400 for malformed JSON", async () => {
      const response = await POST(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{ invalid json",
        })
      );

      const body = await response.json();

      expect(response.status).toBe(400);

      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message: "Request body must contain valid JSON.",
      });
    });

    it("returns a client-actionable validation error", async () => {
      const response = await POST(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: "user123",
            productId: "product123",
            quantity: 0,
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(400);

      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message:
          "userId, productId, and a valid quantity are required.",
      });
    });

    it("returns the same error envelope when the product does not exist", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      });

      const response = await POST(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "POST",
          body: JSON.stringify({
            userId: "user123",
            productId: "missing-product",
            quantity: 1,
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(404);

      expect(body).toEqual({
        error: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      });
    });

    it("does not expose internal errors from Firestore", async () => {
      (getDoc as jest.Mock).mockRejectedValue(
        new Error(
          "FirebaseError: secret-project-id permission denied"
        )
      );

      const response = await POST(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "POST",
          body: JSON.stringify({
            userId: "user123",
            productId: "product123",
            quantity: 1,
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(500);

      expect(body).toEqual({
        error: "SERVER_ERROR",
        message: "Unable to add item to cart.",
      });

      expect(JSON.stringify(body)).not.toContain(
        "secret-project-id"
      );
    });
  });

  describe("PATCH", () => {
    it("returns 400 for malformed JSON", async () => {
      const response = await PATCH(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{ invalid json",
        })
      );

      const body = await response.json();

      expect(response.status).toBe(400);

      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message: "Request body must contain valid JSON.",
      });
    });

    it("returns 404 when the cart item does not exist", async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      const response = await PATCH(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "PATCH",
          body: JSON.stringify({
            userId: "user123",
            productId: "missing-item",
            quantity: 2,
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(404);

      expect(body).toEqual({
        error: "CART_ITEM_NOT_FOUND",
        message: "Cart item not found.",
      });
    });

    it("sanitizes internal update failures", async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
      });

      (setDoc as jest.Mock).mockRejectedValue(
        new Error(
          "write failed at internal Firestore document path"
        )
      );

      const response = await PATCH(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "PATCH",
          body: JSON.stringify({
            userId: "user123",
            productId: "product123",
            quantity: 2,
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(500);

      expect(body).toEqual({
        error: "SERVER_ERROR",
        message: "Unable to update cart item.",
      });

      expect(JSON.stringify(body)).not.toContain(
        "internal Firestore document path"
      );
    });
  });

  describe("DELETE", () => {
    it("returns 400 for malformed JSON", async () => {
      const response = await DELETE(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{ invalid json",
        })
      );

      const body = await response.json();

      expect(response.status).toBe(400);

      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message: "Request body must contain valid JSON.",
      });
    });

    it("returns a consistent validation error for missing fields", async () => {
      const response = await DELETE(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "DELETE",
          body: JSON.stringify({
            userId: "user123",
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(400);

      expect(body).toEqual({
        error: "INVALID_REQUEST",
        message: "userId and productId are required.",
      });
    });

    it("returns 404 when the cart item does not exist", async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      const response = await DELETE(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "DELETE",
          body: JSON.stringify({
            userId: "user123",
            productId: "missing-item",
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(404);

      expect(body).toEqual({
        error: "CART_ITEM_NOT_FOUND",
        message: "Cart item not found.",
      });
    });

    it("does not expose raw delete errors", async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
      });

      (deleteDoc as jest.Mock).mockRejectedValue(
        new Error(
          "FirebaseError: DELETE denied for users/user123/cart/private"
        )
      );

      const response = await DELETE(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "DELETE",
          body: JSON.stringify({
            userId: "user123",
            productId: "private",
          }),
        })
      );

      const body = await response.json();

      expect(response.status).toBe(500);

      expect(body).toEqual({
        error: "SERVER_ERROR",
        message: "Unable to remove cart item.",
      });

      expect(JSON.stringify(body)).not.toContain(
        "users/user123/cart/private"
      );
    });
  });
});