# Food Remedy - API Documentation
**Ticket:** BE014 - API Documentation

---

## Overview
This document covers all backend API endpoints for the Food Remedy mobile application. All enpoints are built using Expo Router API routes and interact with Google Firestore as the primary data source.

**Base URL:** Configured via `EXPO_PUBLIC_API_BASE_URL` environment variable.

**Response format:** All endpoints return `application/json`.

---

## Endpoints

- [Shopping Cart - GET](#1-get-apishoping-cart-api)
- [Shopping Cart - POST](#2-post-apishopping-cart-api)
- [Shopping Cart - PATCH](#3-patch-apishopping-cart-api)
- [Shopping Cart - DELETE](#4-delete-apishopping-cart-api)
- [Product Classification - POST](#5-post-apiproductsclassify)
- [7-Day Meal Plan - POST](#6-post-api7-day-meal-plan)

---

## Shopping Cart

**Route:** `/api/shopping-cart-api`
**Data source:** Firestore - `users/{userId}/cart/{productId}`

---

### 1. GET /api/shopping-cart-api

Retrives all items in a user's cart.

**Query Parameters**

| Parameter | Type   | Required | Description                  |
|-----------|--------|----------|------------------------------|
| userId    | string | Yes      | The ID of the authenticated user |

**Example Request**
```
GET /api/shopping-cart-api?userId=user123
```

**Example Response - 200 OK**
```json
{
    "message": "Cart retrieved successfully.",
    "userId": "user123",
    "items": [
        {
        "productId": "9300617121205",
        "productName": "Weet-Bix",
        "brand": "Sanitarium",
        "imageUrl": "https://example.com/weetbix.jpg",
        "quantity": 2,
        "addedAt": "2026-04-01T10:00:00Z",
        "updatedAt": "2026-04-01T10:00:00Z"
        }
    ]
}
```
**Error Responses**

| Status | Reason                  |
|--------|-------------------------|
| 400    | `userId` not provided   |
| 500    | Firestore fetch failed  |

---

### 2. POST /api/shopping-cart-api

Adds a product to the user's cart. If the product is already in the cart, its quantity is increased.

**Request Body**

| Field     | Type   | Required | Description                        |
|-----------|--------|----------|------------------------------------|
| userId    | string | Yes      | The ID of the authenticated user   |
| productId | string | Yes      | The barcode of the product to add  |
| quantity  | number | Yes      | Must be a positive integer         |

**Example Request**
```json
{
  "userId": "user123",
  "productId": "9300617121205",
  "quantity": 1
}
```

**Example Response - 201 Created** *(new item)*
```json
{
  "message": "Item added to cart.",
  "productId": "9300617121205",
  "quantity": 1
}
```

**Example Response - 200 OK** *(item already in cart, quantity increased)*
```json
{
  "message": "Item quantity updated in cart.",
  "productId": "9300617121205",
  "quantity": 3
}
```

**Error Responses**

| Status | Reason                                          |
|--------|-------------------------------------------------|
| 400    | Missing or invalid `userId`, `productId`, or `quantity` |
| 404    | Product not found in `PRODUCTS` collection      |
| 500    | Firestore operation failed                      |

---

### 3. PATCH /api/shopping-cart-api

Updates the quantity of an item already in the user's cart. Replaces the existing quantity rather than adding to it.

**Request Body**

| Field     | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| userId    | string | Yes      | The ID of the authenticated user     |
| productId | string | Yes      | The barcode of the product to update |
| quantity  | number | Yes      | New quantity - must be a positive integer |

**Example Request**
```json
{
  "userId": "user123",
  "productId": "9300617121205",
  "quantity": 5
}
```

**Example Response - 200 OK**
```json
{
  "message": "Cart item updated successfully.",
  "productId": "9300617121205",
  "quantity": 5
}
```

**Error Responses**

| Status | Reason                                          |
|--------|-------------------------------------------------|
| 400    | Missing or invalid `userId`, `productId`, or `quantity` |
| 404    | Cart item not found for this user               |
| 500    | Firestore operation failed                      |

---

### 4. DELETE /api/shopping-cart-api

Removes an item completely from the user's cart.

**Request Body**

| Field     | Type   | Required | Description                           |
|-----------|--------|----------|---------------------------------------|
| userId    | string | Yes      | The ID of the authenticated user      |
| productId | string | Yes      | The barcode of the product to remove  |

**Example Request**
```json
{
  "userId": "user123",
  "productId": "9300617121205"
}
```

**Example Response - 200 OK**
```json
{
  "message": "Item removed from cart successfully.",
  "productId": "9300617121205"
}
```

**Error Responses**

| Status | Reason                              |
|--------|-------------------------------------|
| 400    | Missing `userId` or `productId`     |
| 404    | Cart item not found for this user   |
| 500    | Firestore operation failed          |

---

## Product Classification

**Route:** `/api/products/classify`  
**Data source:** Firestore - `PRODUCTS/{barcode}`

---

### 5. POST /api/products/classify

Classifies a product as `green`, `grey`, or `red` based on its nutritional content and the user's dietary profile. Used by other endpoints such as the meal plan generator.

**Classification logic:**
- **Red** - product contains an allergen matching the user's profile, or score falls below 40
- **Grey** - score between 40–69, or insufficient nutrition data
- **Green** - score 70 or above with no allergen conflicts

Scoring starts at 100 and applies penalties for high fat, saturated fat, sugars, and salt.

**Request Body**

| Field   | Type   | Required | Description                          |
|---------|--------|----------|--------------------------------------|
| barcode | string | Yes      | Product barcode to look up           |
| profile | object | No       | User's dietary profile (see below)   |

**Profile object**

| Field               | Type     | Description                        |
|---------------------|----------|------------------------------------|
| allergies           | string[] | List of known allergens            |
| intolerances        | string[] | List of food intolerances          |
| dietaryPreferences  | string[] | e.g. `["vegan", "gluten-free"]`    |

**Example Request**
```json
{
  "barcode": "9300617121205",
  "profile": {
    "allergies": ["peanuts", "dairy"],
    "intolerances": ["gluten"],
    "dietaryPreferences": ["vegan"]
  }
}
```

**Example Response - 200 OK** *(green)*
```json
{
  "barcode": "9300617121205",
  "colour": "green",
  "score": 80,
  "reasons": [],
  "productName": "Weet-Bix",
  "brand": "Sanitarium"
}
```

**Example Response - 200 OK** *(red - allergen match)*
```json
{
  "barcode": "9300617121205",
  "colour": "red",
  "score": 0,
  "reasons": ["Contains allergens for this profile: dairy"],
  "productName": "Full Cream Milk",
  "brand": "Devondale"
}
```

**Example Response - 200 OK** *(grey - insufficient data)*
```json
{
  "barcode": "9300617121205",
  "colour": "grey",
  "score": 50,
  "reasons": ["Insufficient nutrition data; classified as GREY by default."],
  "productName": "Unknown Product",
  "brand": null
}
```

**Error Responses**

| Status | Error Code        | Reason                              |
|--------|-------------------|-------------------------------------|
| 400    | INVALID_REQUEST   | Missing or invalid `barcode`        |
| 404    | PRODUCT_NOT_FOUND | No product found for this barcode   |
| 500    | SERVER_ERROR      | Unexpected server error             |

---

## 7-Day Meal Plan

**Route:** `/api/7-day-meal-plan`  
**Data source:** Firestore - `PRODUCTS` collection + `/api/products/classify`

---

### 6. POST /api/7-day-meal-plan

Generates a personalised 7-day meal plan for a user profile. Fetches products from Firestore, classifies each one using the `/api/products/classify` endpoint, filters out unsuitable products (red classification, allergens, diet incompatibility), and assigns meals to breakfast, lunch, dinner, and snack slots for each day.

**Red-classified products are never included in the meal plan.**

**Request Body**

| Field                | Type     | Required | Description                                          |
|----------------------|----------|----------|------------------------------------------------------|
| profileId            | string   | No       | Identifier for the profile (default: `profile-demo`) |
| profileName          | string   | No       | Display name (default: `Demo Profile`)               |
| dietType             | string   | No       | `omnivore`, `vegetarian`, or `vegan` (default: `omnivore`) |
| allergens            | string[] | No       | List of allergens to exclude                         |
| intolerances         | string[] | No       | List of intolerances to exclude                      |
| dietaryPreferences   | string[] | No       | Dietary preference tags                              |
| preferredCategories  | string[] | No       | Preferred product categories                         |
| productLimit         | number   | No       | Number of products to load from Firestore (default: 200, max: 500) |

**Example Request**
```json
{
  "profileId": "profile-abc123",
  "profileName": "Alice",
  "dietType": "vegetarian",
  "allergens": ["peanuts"],
  "intolerances": ["gluten"],
  "dietaryPreferences": ["low-sugar"],
  "preferredCategories": ["breakfast"],
  "productLimit": 200
}
```

**Example Response - 200 OK**
```json
{
  "profileId": "profile-abc123",
  "profileName": "Alice",
  "weekStart": "2026-04-28",
  "days": [
    {
      "day": "Monday",
      "breakfast": {
        "productId": "9300617121205",
        "name": "Weet-Bix",
        "colour": "green",
        "score": 85,
        "tags": ["WHOLEFOOD"],
        "suitabilityNote": "Wholefood category signal"
      },
      "lunch": {
        "productId": "9310072000010",
        "name": "Wholegrain Bread",
        "colour": "green",
        "score": 75,
        "tags": [],
        "suitabilityNote": null
      },
      "dinner": {
        "productId": "9415014000056",
        "name": "Lentil Soup",
        "colour": "grey",
        "score": 55,
        "tags": [],
        "suitabilityNote": "Moderate nutritional risk."
      },
      "snacks": [
        {
          "productId": "9310072000999",
          "name": "Rice Crackers",
          "colour": "green",
          "score": 70,
          "tags": [],
          "suitabilityNote": null
        }
      ]
    }
  ]
}
```

**Example Response - 200 OK** *(with warning - limited options)*
```json
{
  "profileId": "profile-abc123",
  "profileName": "Alice",
  "weekStart": "2026-04-28",
  "days": [ "..." ],
  "warning": "Limited options for this profile; preferences were relaxed to fill more meals."
}
```

**Example Response - 200 OK** *(with warning - no products found)*
```json
{
  "profileId": "profile-abc123",
  "profileName": "Alice",
  "weekStart": "2026-04-28",
  "days": [
    {
      "day": "Monday",
      "breakfast": null,
      "lunch": null,
      "dinner": null,
      "snacks": []
    }
  ],
  "warning": "No suitable products found after applying diet/restrictions and excluding RED products."
}
```

**Error Responses**

| Status | Error Code   | Reason                                    |
|--------|--------------|-------------------------------------------|
| 500    | SERVER_ERROR | Firestore fetch failed or classifier error |

---

## Notes

- All Firestore timestamps (`addedAt`, `updatedAt`) are server-generated using `serverTimestamp()` and will appear as ISO 8601 strings in responses.
- The `quantity` field in shopping cart endpoints must be a **positive integer**. Zero, negative numbers, and decimals are rejected with a 400 error.
- The meal plan endpoint internally calls `/api/products/classify` for every product loaded from Firestore. Setting a high `productLimit` will increase response time.
- Products with a `red` classification are **never** assigned to any meal slot, regardless of fallback behaviour.