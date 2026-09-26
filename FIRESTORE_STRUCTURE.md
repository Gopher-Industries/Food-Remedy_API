# Firestore Structure (Actual Usage)

## PRODUCTS Collection
- `/PRODUCTS/{productId}`
  - barcode: string
  - productName: string
  - genericName: string | null
  - brand: string | null
  - ingredientsText: string | null
  - ingredientsAnalysis: string[] | null
  - additives: string[]
  - allergens: string[] (known values, or `["Unknown"]` when missing/empty)
  - categories: string[]
  - labels: string[]
  - ingredients: string[]
  - traces: string | null
  - tracesFromIngredients: string | null
  - nutriments: Record<string, number | string>
  - nutrientLevels: { fat, salt, sugars, saturated-fat: "low"|"moderate"|"high"|"unknown" }
  - nutriscoreGrade: "A" | "B" | "C" | "D" | "E" | "UNKNOWN" | string
  - productQuantity: number | null
  - productQuantityUnit: string | null
  - servingQuantity: number | null
  - servingQuantityUnit: string | null
  - dateAdded?: string
  - lastUpdated?: string
  - completeness: number
  - imageURL?: Images
  - images: Images

## USERS Collection
- `/users/{userId}`
  - (no direct fields required by frontend, but see subcollections)

### Cart Subcollection
- `/users/{userId}/cart/{productId}`
  - productId: string (document ID, also stored in field)
  - quantity: number
  - productName: string | null
  - brand: string | null
  - imageUrl: string | null
  - addedAt: timestamp
  - updatedAt: timestamp

## USERS Collection (Cloud Sync)
- `/USERS/{userId}/PROFILES/{profileId}`
  - Safety profile fields such as allergies, intolerances, additives and dietary forms, plus profile metadata. Personalization preferences belong in the separate child record below.

### Personalization (separate from safety profiles)
- `/USERS/{userId}/PROFILES/{profileId}/PERSONALIZATION/preferences`
  - `schemaVersion: "1.0.0"`, `profileId`, bounded explicit `entries`, `updatedAt`
- `/USERS/{userId}/PROFILES/{profileId}/SAVED_INTENTS/{intentId}`
  - Versioned, explicit saved intention and optional deletion tombstone
- Firestore rules require the authenticated owner and parent profile; saved-intent
  writes require an active parent and a bounded record. Preference writes use
  the authenticated backend validator. Missing parents make children unreadable. Profile
  and account deletion delete child documents before parent documents.
- Matching offline tables are `profile_preferences` and
  `saved_shopping_intents` (SQLite `user_version` 7). Neither changes safety
  profile fields or substitution eligibility.

---

## Notes & Discrepancies

- The main products collection is named `PRODUCTS` (uppercase) in code, not `products`.
- Cart items are stored as subcollections under `/users/{userId}/cart/`.
- User profiles for sync are stored under `/USERS/{userId}/PROFILES/` (uppercase).
- The `Product` interface in your code is the source of truth for product fields.
- No direct `/profiles` root collection is used by the frontend.
