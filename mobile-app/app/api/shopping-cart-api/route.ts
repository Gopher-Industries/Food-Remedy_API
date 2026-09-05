/* Shopping Cart API
Supported endpoints:
- GET - gets all items in a user's cart
- POST - adds an item to the cart
- PATCH - updates the quantity of an item already in the cart
- DELETE - removes an item from the cart
*/

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";

type CartRequestBody = {
  userId?: string;
  productId?: string;
  quantity?: number;
};

type ErrorEnvelope = {
  error: string;
  message: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(
  error: string,
  message: string,
  status: number
): Response {
  const body: ErrorEnvelope = {
    error,
    message,
  };

  return jsonResponse(body, status);
}

function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

async function readRequestBody(
  request: Request
): Promise<CartRequestBody | null> {
  try {
    return (await request.json()) as CartRequestBody;
  } catch {
    return null;
  }
}

/* GET
Retrieve all cart items for a specific user.
*/
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return errorResponse(
        "INVALID_REQUEST",
        "userId is required.",
        400
      );
    }

    const cartRef = collection(fdb, "users", userId, "cart");
    const snapshot = await getDocs(cartRef);

    const items = snapshot.docs.map((docSnap) => ({
      productId: docSnap.id,
      ...docSnap.data(),
    }));

    return jsonResponse({
      message: "Cart retrieved successfully.",
      userId,
      items,
    });
  } catch (error) {
    console.error("Shopping cart GET failed:", error);

    return errorResponse(
      "SERVER_ERROR",
      "Unable to retrieve cart.",
      500
    );
  }
}

/* POST
Add a product to the user's cart.
*/
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestBody(request);

    if (!body) {
      return errorResponse(
        "INVALID_REQUEST",
        "Request body must contain valid JSON.",
        400
      );
    }

    const { userId, productId, quantity } = body;

    if (!userId || !productId || !isValidQuantity(quantity)) {
      return errorResponse(
        "INVALID_REQUEST",
        "userId, productId, and a valid quantity are required.",
        400
      );
    }

    const productRef = doc(fdb, "PRODUCTS", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return errorResponse(
        "PRODUCT_NOT_FOUND",
        "Product not found.",
        404
      );
    }

    const productData = productSnap.data();

    const cartItemRef = doc(
      fdb,
      "users",
      userId,
      "cart",
      productId
    );

    const existingCartItem = await getDoc(cartItemRef);

    if (existingCartItem.exists()) {
      const existingData = existingCartItem.data();
      const newQuantity =
        Number(existingData.quantity || 0) + quantity;

      await setDoc(
        cartItemRef,
        {
          ...existingData,
          quantity: newQuantity,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return jsonResponse({
        message: "Item quantity updated in cart.",
        productId,
        quantity: newQuantity,
      });
    }

    await setDoc(cartItemRef, {
      productId,
      quantity,
      productName: productData.productName || null,
      brand: productData.brand || null,
      imageUrl: productData.imageUrl || null,
      addedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return jsonResponse(
      {
        message: "Item added to cart.",
        productId,
        quantity,
      },
      201
    );
  } catch (error) {
    console.error("Shopping cart POST failed:", error);

    return errorResponse(
      "SERVER_ERROR",
      "Unable to add item to cart.",
      500
    );
  }
}

/* PATCH
Update the quantity of an existing cart item.
*/
export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = await readRequestBody(request);

    if (!body) {
      return errorResponse(
        "INVALID_REQUEST",
        "Request body must contain valid JSON.",
        400
      );
    }

    const { userId, productId, quantity } = body;

    if (!userId || !productId || !isValidQuantity(quantity)) {
      return errorResponse(
        "INVALID_REQUEST",
        "userId, productId, and a valid quantity are required.",
        400
      );
    }

    const cartItemRef = doc(
      fdb,
      "users",
      userId,
      "cart",
      productId
    );

    const cartItemSnap = await getDoc(cartItemRef);

    if (!cartItemSnap.exists()) {
      return errorResponse(
        "CART_ITEM_NOT_FOUND",
        "Cart item not found.",
        404
      );
    }

    await setDoc(
      cartItemRef,
      {
        quantity,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return jsonResponse({
      message: "Cart item updated successfully.",
      productId,
      quantity,
    });
  } catch (error) {
    console.error("Shopping cart PATCH failed:", error);

    return errorResponse(
      "SERVER_ERROR",
      "Unable to update cart item.",
      500
    );
  }
}

/* DELETE
Remove an item completely from the user's cart.
*/
export async function DELETE(request: Request): Promise<Response> {
  try {
    const body = await readRequestBody(request);

    if (!body) {
      return errorResponse(
        "INVALID_REQUEST",
        "Request body must contain valid JSON.",
        400
      );
    }

    const { userId, productId } = body;

    if (!userId || !productId) {
      return errorResponse(
        "INVALID_REQUEST",
        "userId and productId are required.",
        400
      );
    }

    const cartItemRef = doc(
      fdb,
      "users",
      userId,
      "cart",
      productId
    );

    const cartItemSnap = await getDoc(cartItemRef);

    if (!cartItemSnap.exists()) {
      return errorResponse(
        "CART_ITEM_NOT_FOUND",
        "Cart item not found.",
        404
      );
    }

    await deleteDoc(cartItemRef);

    return jsonResponse({
      message: "Item removed from cart successfully.",
      productId,
    });
  } catch (error) {
    console.error("Shopping cart DELETE failed:", error);

    return errorResponse(
      "SERVER_ERROR",
      "Unable to remove cart item.",
      500
    );
  }
}