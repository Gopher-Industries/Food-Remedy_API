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
  - All profile fields (dynamic, but typically includes: allergies, intolerances, dietaryPreferences, preferredCategories, updated_at, etc.)

## Product Submission Moderation Boundary
- `/PRODUCT_SUBMISSIONS/ps_{normalizedBarcode}`
  - `submissionId`: stable string derived from the normalized barcode
  - `barcode`: canonical EAN-8, UPC-A, EAN-13, or GTIN-14 digit string
  - `status`: `PENDING`
  - `unverified`: `true`
  - `productName`, `brand`, `retailer`, `note`: optional, bounded and unverified reporter text
  - `reportCount`: bounded aggregate count; it contains no reporter identity
  - `createdAt`, `lastReportedAt`: server timestamps
- `/PRODUCT_SUBMISSION_REPORTERS/{opaqueHash}`
  - Server-only, capped idempotency ledger for a reporter/barcode pair.
  - Document IDs are hashes; no raw UID, email address, or note is used as an ID.
- `/PRODUCT_SUBMISSION_RATE_LIMITS/{opaqueHash}`
  - Server-only per-reporter rate-limit counter. Document IDs are hashes.

---

## Notes & Discrepancies

- The main products collection is named `PRODUCTS` (uppercase) in code, not `products`.
- Cart items are stored as subcollections under `/users/{userId}/cart/`.
- User profiles for sync are stored under `/USERS/{userId}/PROFILES/` (uppercase).
- The `Product` interface in your code is the source of truth for product fields.
- No direct `/profiles` root collection is used by the frontend.
- Product submissions are a moderation queue, never a `PRODUCTS` write. Firestore
  clients cannot read or write the submission, reporter-ledger, or rate-limit paths.
