/* Shopping Cart API
Supported endpoints:
- GET - gets all items in a user's cart
- POST - Adds an item to the cart
- PATCH - Updates the quantity of an item already in the cart
- DELETE - Removes an item from the cart
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
import { authenticateRequest } from "@/services/authMiddleware";

// Type that is used for POST, PATCH, and DELETE request bodies
type CartRequestBody = {
    userId?: string;
    productId?: string;
    quantity?: number;
};

// Helper function to return JSON responses more easily
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Small helper function to check that quantity is a valid positive integer
function isValidQuantity(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/* GET function
Purpose: Retrieve all cart items for a specific user
*/
export async function GET(request: Request): Promise<Response> {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");

        if (!userId) {
            return jsonResponse({ error: "userId is required." }, 400);
        }

        const auth = authenticateRequest(request, userId);
        if (!auth.success) {
            return jsonResponse({ error: auth.error, message: auth.message }, auth.status);
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

    } catch (error: any) {
        return jsonResponse(
            { error: error.message || "Failed to retrieve cart." },
            500
        );
    }
}

/* POST function
Purpose: Adds a product to the user's cart
*/
export async function POST(request: Request): Promise<Response> {
    try {
        const body = (await request.json()) as CartRequestBody;
        const { userId, productId, quantity } = body;

        if (!userId || !productId || !isValidQuantity(quantity)) {
            return jsonResponse(
                { error: "userId, productId, and a valid quantity are required." },
                400
            );
        }

        const auth = authenticateRequest(request, userId);
        if (!auth.success) {
            return jsonResponse({ error: auth.error, message: auth.message }, auth.status);
        }

        const productRef = doc(fdb, "PRODUCTS", productId);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
            return jsonResponse({ error: "Product not found." }, 404);
        }

        const productData = productSnap.data();
        const cartItemRef = doc(fdb, "users", userId, "cart", productId);
        const existingCartItem = await getDoc(cartItemRef);

        if (existingCartItem.exists()) {
            const existingData = existingCartItem.data();
            const newQuantity = Number(existingData.quantity || 0) + quantity;

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

    } catch (error: any) {
        return jsonResponse(
            { error: error.message || "Failed to add item to cart." },
            500
        );
    }
}

/* PATCH function
Purpose: Updates the quantity of an item already in the cart
*/
export async function PATCH(request: Request): Promise<Response> {
    try {
        const body = (await request.json()) as CartRequestBody;
        const { userId, productId, quantity } = body;

        if (!userId || !productId || !isValidQuantity(quantity)) {
            return jsonResponse(
                { error: "userId, productId, and a valid quantity are required." },
                400
            );
        }

        const auth = authenticateRequest(request, userId);
        if (!auth.success) {
            return jsonResponse({ error: auth.error, message: auth.message }, auth.status);
        }

        const cartItemRef = doc(fdb, "users", userId, "cart", productId);
        const cartItemSnap = await getDoc(cartItemRef);

        if (!cartItemSnap.exists()) {
            return jsonResponse({ error: "Cart item not found." }, 404);
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

    } catch (error: any) {
        return jsonResponse(
            { error: error.message || "Failed to update cart item." },
            500
        );
    }
}

/* DELETE function
Purpose: Removes an item completely from the user's cart
*/
export async function DELETE(request: Request): Promise<Response> {
    try {
        const body = (await request.json()) as CartRequestBody;
        const { userId, productId } = body;

        if (!userId || !productId) {
            return jsonResponse(
                { error: "userId, and productId are required." },
                400
            );
        }

        const auth = authenticateRequest(request, userId);
        if (!auth.success) {
            return jsonResponse({ error: auth.error, message: auth.message }, auth.status);
        }

        const cartItemRef = doc(fdb, "users", userId, "cart", productId);
        const cartItemSnap = await getDoc(cartItemRef);

        if (!cartItemSnap.exists()) {
            return jsonResponse({ error: "Cart item not found." }, 404);
        }

        await deleteDoc(cartItemRef);

        return jsonResponse({
            message: "Item removed from cart successfully.",
            productId,
        });

    } catch (error: any) {
        return jsonResponse(
            { error: error.message || "Failed to remove cart item." },
            500
        );
    }
}