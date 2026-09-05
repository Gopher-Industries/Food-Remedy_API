jest.mock("@/config/firebaseConfig", () => ({ fdb: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => "mock-server-timestamp"),
}));

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { DELETE, GET, PATCH, POST } from "../app/api/shopping-cart-api/route";

const mockedCollection = collection as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedDoc = doc as jest.Mock;
const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedServerTimestamp = serverTimestamp as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/shopping-cart-api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json();
}

describe("shopping-cart-api route", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedCollection.mockReturnValue({ path: "users/user-1/cart" });
    mockedDoc.mockImplementation((...segments: unknown[]) => ({
      path: segments.slice(1).join("/"),
    }));
    mockedServerTimestamp.mockReturnValue("mock-server-timestamp");
  });

  describe("GET", () => {
    it("rejects requests without a userId", async () => {
      const response = await GET(
        new Request("http://localhost/api/shopping-cart-api")
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "userId is required." });
      expect(mockedGetDocs).not.toHaveBeenCalled();
    });

    it("returns cart items for a user", async () => {
      mockedGetDocs.mockResolvedValue({
        docs: [
          {
            id: "product-1",
            data: () => ({ quantity: 2, productName: "Oats" }),
          },
          {
            id: "product-2",
            data: () => ({ quantity: 1, brand: "Fresh" }),
          },
        ],
      });

      const response = await GET(
        new Request("http://localhost/api/shopping-cart-api?userId=user-1")
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(mockedCollection).toHaveBeenCalledWith(
        {},
        "users",
        "user-1",
        "cart"
      );
      expect(body).toEqual({
        message: "Cart retrieved successfully.",
        userId: "user-1",
        items: [
          { productId: "product-1", quantity: 2, productName: "Oats" },
          { productId: "product-2", quantity: 1, brand: "Fresh" },
        ],
      });
    });

    it("returns a 500 response when Firestore read fails", async () => {
      mockedGetDocs.mockRejectedValue(new Error("read failed"));

      const response = await GET(
        new Request("http://localhost/api/shopping-cart-api?userId=user-1")
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "read failed" });
    });
  });

  describe("POST", () => {
    it.each([
      ["missing userId", { productId: "product-1", quantity: 1 }],
      ["missing productId", { userId: "user-1", quantity: 1 }],
      ["zero quantity", { userId: "user-1", productId: "product-1", quantity: 0 }],
      [
        "negative quantity",
        { userId: "user-1", productId: "product-1", quantity: -1 },
      ],
      [
        "decimal quantity",
        { userId: "user-1", productId: "product-1", quantity: 1.5 },
      ],
      [
        "string quantity",
        { userId: "user-1", productId: "product-1", quantity: "1" },
      ],
    ])("rejects %s", async (_caseName, body) => {
      const response = await POST(jsonRequest("POST", body));
      const responseBody = await readJson(response);

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "userId, productId, and a valid quantity are required.",
      });
      expect(mockedSetDoc).not.toHaveBeenCalled();
    });

    it("adds a new item when the product exists and is not already in the cart", async () => {
      mockedGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            productName: "Rolled Oats",
            brand: "Pantry",
            imageUrl: "https://example.test/oats.png",
          }),
        })
        .mockResolvedValueOnce({ exists: () => false });

      const response = await POST(
        jsonRequest("POST", {
          userId: "user-1",
          productId: "product-1",
          quantity: 2,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(201);
      expect(mockedDoc).toHaveBeenNthCalledWith(1, {}, "PRODUCTS", "product-1");
      expect(mockedDoc).toHaveBeenNthCalledWith(
        2,
        {},
        "users",
        "user-1",
        "cart",
        "product-1"
      );
      expect(mockedSetDoc).toHaveBeenCalledWith(
        { path: "users/user-1/cart/product-1" },
        {
          productId: "product-1",
          quantity: 2,
          productName: "Rolled Oats",
          brand: "Pantry",
          imageUrl: "https://example.test/oats.png",
          addedAt: "mock-server-timestamp",
          updatedAt: "mock-server-timestamp",
        }
      );
      expect(body).toEqual({
        message: "Item added to cart.",
        productId: "product-1",
        quantity: 2,
      });
    });

    it("increments quantity when adding a product already in the cart", async () => {
      mockedGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ productName: "Rolled Oats" }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ quantity: 3, productName: "Rolled Oats" }),
        });

      const response = await POST(
        jsonRequest("POST", {
          userId: "user-1",
          productId: "product-1",
          quantity: 2,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(mockedSetDoc).toHaveBeenCalledWith(
        { path: "users/user-1/cart/product-1" },
        {
          quantity: 5,
          productName: "Rolled Oats",
          updatedAt: "mock-server-timestamp",
        },
        { merge: true }
      );
      expect(body).toEqual({
        message: "Item quantity updated in cart.",
        productId: "product-1",
        quantity: 5,
      });
    });

    it("returns 404 when adding a missing product", async () => {
      mockedGetDoc.mockResolvedValueOnce({ exists: () => false });

      const response = await POST(
        jsonRequest("POST", {
          userId: "user-1",
          productId: "missing-product",
          quantity: 1,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(404);
      expect(body).toEqual({ error: "Product not found." });
      expect(mockedSetDoc).not.toHaveBeenCalled();
    });

    it("returns a 500 response for malformed JSON", async () => {
      const response = await POST(
        new Request("http://localhost/api/shopping-cart-api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toContain("JSON");
      expect(mockedSetDoc).not.toHaveBeenCalled();
    });

    it("returns a 500 response when writing a new item fails", async () => {
      mockedGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ productName: "Rolled Oats" }),
        })
        .mockResolvedValueOnce({ exists: () => false });
      mockedSetDoc.mockRejectedValue(new Error("write failed"));

      const response = await POST(
        jsonRequest("POST", {
          userId: "user-1",
          productId: "product-1",
          quantity: 1,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "write failed" });
    });
  });

  describe("PATCH", () => {
    it.each([
      ["missing userId", { productId: "product-1", quantity: 1 }],
      ["missing productId", { userId: "user-1", quantity: 1 }],
      ["zero quantity", { userId: "user-1", productId: "product-1", quantity: 0 }],
      [
        "negative quantity",
        { userId: "user-1", productId: "product-1", quantity: -1 },
      ],
      [
        "string quantity",
        { userId: "user-1", productId: "product-1", quantity: "1" },
      ],
    ])("rejects %s", async (_caseName, body) => {
      const response = await PATCH(jsonRequest("PATCH", body));
      const responseBody = await readJson(response);

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "userId, productId, and a valid quantity are required.",
      });
      expect(mockedSetDoc).not.toHaveBeenCalled();
    });

    it("updates the quantity for an existing cart item", async () => {
      mockedGetDoc.mockResolvedValue({ exists: () => true });

      const response = await PATCH(
        jsonRequest("PATCH", {
          userId: "user-1",
          productId: "product-1",
          quantity: 4,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(mockedSetDoc).toHaveBeenCalledWith(
        { path: "users/user-1/cart/product-1" },
        {
          quantity: 4,
          updatedAt: "mock-server-timestamp",
        },
        { merge: true }
      );
      expect(body).toEqual({
        message: "Cart item updated successfully.",
        productId: "product-1",
        quantity: 4,
      });
    });

    it("returns 404 when updating a missing cart item", async () => {
      mockedGetDoc.mockResolvedValue({ exists: () => false });

      const response = await PATCH(
        jsonRequest("PATCH", {
          userId: "user-1",
          productId: "missing-product",
          quantity: 4,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(404);
      expect(body).toEqual({ error: "Cart item not found." });
      expect(mockedSetDoc).not.toHaveBeenCalled();
    });

    it("returns a 500 response when updating fails", async () => {
      mockedGetDoc.mockResolvedValue({ exists: () => true });
      mockedSetDoc.mockRejectedValue(new Error("update failed"));

      const response = await PATCH(
        jsonRequest("PATCH", {
          userId: "user-1",
          productId: "product-1",
          quantity: 4,
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "update failed" });
    });
  });

  describe("DELETE", () => {
    it.each([
      ["missing userId", { productId: "product-1" }],
      ["missing productId", { userId: "user-1" }],
    ])("rejects %s", async (_caseName, body) => {
      const response = await DELETE(jsonRequest("DELETE", body));
      const responseBody = await readJson(response);

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "userId, and productId are required.",
      });
      expect(mockedDeleteDoc).not.toHaveBeenCalled();
    });

    it("removes an existing cart item", async () => {
      mockedGetDoc.mockResolvedValue({ exists: () => true });

      const response = await DELETE(
        jsonRequest("DELETE", {
          userId: "user-1",
          productId: "product-1",
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(mockedDeleteDoc).toHaveBeenCalledWith({
        path: "users/user-1/cart/product-1",
      });
      expect(body).toEqual({
        message: "Item removed from cart successfully.",
        productId: "product-1",
      });
    });

    it("returns 404 when deleting a missing cart item", async () => {
      mockedGetDoc.mockResolvedValue({ exists: () => false });

      const response = await DELETE(
        jsonRequest("DELETE", {
          userId: "user-1",
          productId: "missing-product",
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(404);
      expect(body).toEqual({ error: "Cart item not found." });
      expect(mockedDeleteDoc).not.toHaveBeenCalled();
    });

    it("returns a 500 response when deletion fails", async () => {
      mockedGetDoc.mockResolvedValue({ exists: () => true });
      mockedDeleteDoc.mockRejectedValue(new Error("delete failed"));

      const response = await DELETE(
        jsonRequest("DELETE", {
          userId: "user-1",
          productId: "product-1",
        })
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "delete failed" });
    });
  });
});
