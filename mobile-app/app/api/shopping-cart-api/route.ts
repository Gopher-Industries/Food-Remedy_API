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
function isValidQuanity(value: unknown): value is number {
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
        
    } catch (error: any) {
        return jsonResponse(
            { error: error.message || "Failed to remove cart item." },
            500
        );
    }
}