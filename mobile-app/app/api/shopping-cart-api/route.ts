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
import {fdb} from "@/config/firebaseConfig";

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
        headers:  { "Content-Type": "application/json"},
    });
}

// Small helper function to check that quantity is a valid positive integer
// Using this for POST and PATCH so users cannot send 0, negatives, or decimals
function isValidQuantity(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/* GET function
Purpose: Retrieve all cart items for a specific user

- Read userId from the URL query string
- Find the user's cart collection in Firestore
- Get all documents inside that cart collection
- Return them as JSON
*/
export async function GET(request: Request): Promise<Response> {
    try{
        // Reading the userId from the URL
        // Example: /api/cart?userId=user123
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");

        // UserId is required to know whose cart to load
        if (!userId) {
            return jsonResponse({ error: "userId is required." }, 400);
        }

        // Reference the user's cart subcollection
        const cartRef = collection(fdb, "users", userId, "cart");

        // Get all cart times for this user
        const snapshot = await getDocs(cartRef);

        // Convert Firestore docs into plain JSON objects
        // Using document ID as productId
        const items = snapshot.docs.map((docSnap) => ({
            productId: docSnap.id,
            ...docSnap.data(),
        }));

        // Sending the cart items back to the client
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

Expected request body:
{
    "userId": "user123",
    "productId": "xxxxxxxxxx"
    "quantity": "x"
}

- Reads userId, productId, and quantity from the request body
- Validates the input
- Check the product exists in the PRODUCTS collection
- Check if the item is already in the cart
- If it exists, increase the quantity
- If it doesn't, create a new cart item
*/
export async function POST(request: Request): Promise<Response> {
    try{
        // Read JSON body sent from the frontend
        const body = (await request.json()) as CartRequestBody;
        const { userId, productId, quantity } = body;

        // Making sure all required fields are present and valid
        if (!userId || !productId || !isValidQuantity(quantity)) {
            return jsonResponse(
                { error: "userId, productId, and a valid quantity are required." },
                400
            );
        }

        // Look up the product in the main PRODUCTS collection first
        // This is to make sure users can only add real products to their cart
        const productRef = doc(fdb, "PRODUCTS", productId);
        const productSnap = await getDoc(productRef);

        // If the product does not exist, return 404
        if (!productSnap.exists()) {
            return jsonResponse({ error: "Product not found."}, 404);
        }

        // Get the product data to save some potential display info
        const productData = productSnap.data();

        // Reference the cart item document
        const cartItemRef = doc(fdb, "users", userId, "cart", productId);

        // Checking whether this product is already in the user's cart
        const existingCartItem = await getDoc(cartItemRef);

        if (existingCartItem.exists()) {
            // If the item already exists, increase the quantity instead of creating a duplicate
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

        // If the item is not already in the cart, create it
        // Product info is also stored so the fronted can display cart items easily
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

Expected request body:
{
    "userId": "user123",
    "productId": "xxxxxxxxxx"
    "quantity": "x"
}

- Reads userId, productId, and quantity from the body
- Validates the input
- Check the cart item exists
- Update only the quantity and updatedAt fields
*/
export async function PATCH(request: Request): Promise<Response> {
    try{
        // Read JSON body sent from the frontend
        const body = (await request.json()) as CartRequestBody;
        const { userId, productId, quantity } = body;

        // Making sure all required fields are present and valid
        if (!userId || !productId || !isValidQuantity(quantity)) {
            return jsonResponse(
                { error: "userId, productId, and a valid quantity are required." },
                400
            );
        }

        // Reference the existing cart item
        const cartItemRef = doc(fdb, "users", userId, "cart", productId);
        const cartItemSnap = await getDoc(cartItemRef);

        // The item must already exist before it can be updated
        if (!cartItemSnap.exists()) {
            return jsonResponse({ error: "Cart item not found." }, 404);
        }

        // Update just the quantity and updated timestamp
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
Expected request body:
{
    "userId": "user123",
    "productId": "x"
}

- Reads userId and productId from the request body
- Validates the input
- Check the cart item exists
- Delete the cart item document from Firestore
*/
export async function DELETE(request: Request): Promise<Response> {
    try{
        // Read JSON body sent from the frontend
        const body = (await request.json()) as CartRequestBody;
        const { userId, productId } = body;

        // Both userId and product are needed to find the cart item
        if (!userId || !productId) {
            return jsonResponse(
                { error: "userId, and productId are required." },
                400
            );
        }

        // Reference the cart item to remove
        const cartItemRef = doc(fdb, "users", userId, "cart", productId);
        const cartItemSnap = await getDoc(cartItemRef);

        // Making sure the item exists before trying to delete it
        if (!cartItemSnap.exists()) {
            return jsonResponse({ error: "Cart item not found." }, 404);
        }

        // Delete the item from Firestore
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