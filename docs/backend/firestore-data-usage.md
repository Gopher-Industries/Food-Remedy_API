# Firestore collection naming and usage map

Ticket: BE002

Repository baseline inspected: `0093b72`

Inventory date: 2026-08-12

## Purpose and limits

This document inventories Firestore collection and document paths referenced by backend-related repository code. It is a code-level map, not a deployed-environment audit. Firestore collection IDs are case-sensitive, so names are reproduced exactly as written.

No collection rename, schema change, data migration, or live Firebase path change is proposed here. Field lists are intentionally omitted except where a field controls document identity or query behaviour; this ticket maps path usage rather than defining a schema contract.

Notation uses `{uid}`, `{userId}`, `{profileId}`, `{listId}`, `{barcode}`, `{productId}`, and `{autoId}` for runtime values.

## Runtime application paths

| Firestore path | Reads | Writes | Deletes | Repository references and notes |
|---|---:|---:|---:|---|
| `USERS/{uid}` | Yes | Yes | Yes | Registration creates the document in `mobile-app/services/authentication/registerWithEmail.ts:51`. Existence, generic value, and name reads occur in `mobile-app/services/authentication/checkUserExists.ts:12`, `mobile-app/services/database/user/getUserValue.ts:12-13`, and `mobile-app/services/database/user/getUserProfileName.ts:11-12`. Generic field updates occur in `mobile-app/services/database/user/updateUserValue.ts:14-23`. Account cleanup deletes it in `mobile-app/services/database/user/deleteUserAccount.ts:6,30`. `mobile-app/services/database/user/profiles.ts:7` also defines a reference helper for this path, but does not use it. |
| `USERS/{uid}/PROFILES` | Yes | Indirectly through child documents | Indirectly through child documents | Collection listing occurs in `mobile-app/services/database/user/profiles.ts:8,53-55`, account cleanup reads it in `mobile-app/services/database/user/deleteUserAccount.ts:5,12`, and cloud sync reads it in `mobile-app/services/sync/syncProfilesServices.ts:48-49`. |
| `USERS/{uid}/PROFILES/{profileId}` | Yes | Yes | Yes | Profile CRUD uses this document in `mobile-app/services/database/user/profiles.ts:9,44,49,74,96,105`. Sync writes it in `mobile-app/services/sync/syncProfilesServices.ts:112-116,198-201`. Account cleanup batch-deletes documents returned from the parent collection in `mobile-app/services/database/user/deleteUserAccount.ts:12-27`. |
| `USERS/{uid}/SHOPPING_LISTS` | Yes | Indirectly through child documents | Indirectly through child documents | List enumeration is in `mobile-app/services/database/user/shoppingLists.ts:25,49-56`. |
| `USERS/{uid}/SHOPPING_LISTS/{listId}` | Yes | Yes | Yes | List create/read/update/delete is in `mobile-app/services/database/user/shoppingLists.ts:26,46,65-67,80,93`. Item changes also update the parent list timestamp at line 153. |
| `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS` | Yes | Indirectly through child documents | Indirectly through child documents | Item enumeration, filtered reads, counts, and batch cleanup use the collection in `mobile-app/services/database/user/shoppingLists.ts:27,85-91,161-175,231-249`. |
| `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}` | Yes | Yes | Yes | The barcode is explicitly used as the item document ID (`mobile-app/services/database/user/shoppingLists.ts:28-29`). Create/upsert/read/update/delete operations are at lines 106-153, 195, 205, 214-219, 228, and 273. |
| `users/{userId}` | Yes | No direct document write found | No | Lowercase user document read by `mobile-app/services/sync/syncUserService.ts:13-16`. A parent document is not required for the lowercase `cart` subcollection to contain documents, so cart writes below do not establish that this document exists. |
| `users/{userId}/cart` | Yes | Indirectly through child documents | Indirectly through child documents | Cart enumeration is in `mobile-app/app/api/shopping-cart-api/route.ts:65-72`. |
| `users/{userId}/cart/{productId}` | Yes | Yes | Yes | Cart add/increment, quantity update, and removal use this path in `mobile-app/app/api/shopping-cart-api/route.ts:138-175,225-243,286-295`. The product ID is both the document ID and a stored field for newly created items. Writes use `setDoc`, with merge for quantity updates. |
| `PRODUCTS` | Yes | Indirectly through child documents in non-app utilities | No delete found | App collection queries occur in `mobile-app/services/database/products/searchProducts.ts:12-43`, `mobile-app/services/database/products/getCandidatesForRecommendations.ts:43-50`, and `mobile-app/app/api/7-day-meal-plan/+api.ts:221-224`. |
| `PRODUCTS/{barcode}` | Yes | Yes in seeding/test utilities | No delete found | App reads occur in `mobile-app/services/database/products/getProductById.ts:13-14`, `mobile-app/services/database/products/searchProducts.ts:18`, `mobile-app/app/api/products/[barcode]+api.ts:29-30`, and `mobile-app/app/api/products/classify+api.ts:145-146`. The cart API validates products at this path using `{productId}` as the final segment (`mobile-app/app/api/shopping-cart-api/route.ts:126-127`). Uppercase writes occur in `database/seeding/seed_engine.py:96-97` and `test/test_products.py:83-85`. |
| `FEEDBACK/{autoId}` | No | Yes | No | `addDoc` generates the document ID in `mobile-app/services/database/feedback/submitFeedback.ts:19-25`. No repository reader or deleter was found. |

## Lowercase product path used by seeding and integration tooling

| Firestore path | Reads | Writes | Deletes | Repository references and notes |
|---|---:|---:|---:|---|
| `products` | Yes in integration checks | Indirectly through child documents | No delete found | The live-capable integration checker defaults to lowercase `products`, but permits `FIRESTORE_PRODUCTS_COLLECTION` to override it (`database/db012_integration_test.py:4-5,58-65,78-81`). It performs document reads and collection queries at lines 83-165. |
| `products/{barcode}` | Yes in integration checks | Yes | No delete found | The primary enhanced seeding path writes with merge in `database/seeding/seed_firestore.py:413-414`. The legacy batch seeder sets `PRODUCTS_COLLECTION = "products"` and writes with merge in `database/seeding/batch_seeder.py:22,58-59`. The integration checker reads documents selected by barcode as described above. |

`database/seeding/seed_products.py:19-27` delegates to `seed_firestore.py`, so it inherits the lowercase `products/{barcode}` destination rather than defining another path.

## Firebase Storage path related to profiles (not Firestore)

The ticket's named avatar helper does not access Firestore. It accesses Firebase Storage objects at:

`USERS/{uid}/PROFILES/{profileId}/avatar{ext}`

where `{ext}` is `.jpg`, `.png`, or `.webp`. The path is constructed in `mobile-app/services/storage/uploadProfileAvatar.ts:186-194`. Upload and download operations are at lines 9-40 and 71-84; deletion by constructed path is at lines 50-63. Recursive user-profile storage cleanup starts at the prefix `USERS/{uid}/PROFILES` at lines 65-69 and 202-205. Deletion by an already stored download URL is also supported at lines 44-48. Native uploads use the same object path through the Firebase Storage REST endpoint at lines 87-162.

The identical-looking uppercase segments in this Storage object key do not make it a Firestore collection/document path. Storage and Firestore are separate services and namespaces.

## Tests, rules, configuration, and existing documentation

- `mobile-app/__tests__/profileSync.test.ts:201-216,259-263` asserts the uppercase `USERS/{userId}/PROFILES/{profileId}` sync path using mocked Firestore functions. The mock does not contact Firebase.
- `mobile-app/__tests__/productDetailApi.test.ts` and `mobile-app/__tests__/db030_api_ui_flow.test.ts` mock Firestore reads exercised by the uppercase product API routes. They provide behavioural coverage but no deployed-path evidence.
- `database/db012_integration_test.py` and the non-dry-run modes of the seeding utilities can contact a configured Firebase project; running them was not required to identify their paths and would mutate or depend on external state.
- `database/seeding/test_firestore_connection.py:7` constructs a Firestore client but names no collection or document path.
- `mobile-app/config/firebaseConfig.ts:21,38` selects the Firebase app from environment-backed configuration and creates the default Firestore client. It does not pin a collection name.
- `firestore.rules:1-6` currently contains only a recursive `/{document=**}` development match. It names no concrete collection and therefore does not resolve any naming inconsistency. It also must not be treated as proof of deployed rules.
- `FIRESTORE_STRUCTURE.md:3-57` describes uppercase `PRODUCTS`, lowercase `users/.../cart`, and uppercase `USERS/.../PROFILES`, but does not include every runtime path above and incorrectly implies uppercase product naming is uniform. Executable references take precedence for this inventory, while neither source proves deployed state.

## Naming inconsistencies and planning risks

| Inconsistency or risk | Repository evidence | Planning impact |
|---|---|---|
| `USERS` and `users` both occur. | Authentication, profile, and shopping-list code uses `USERS`; `syncUserService.ts` and the cart API use `users`. | These are distinct root collections in Firestore. A document or field written under one casing is not visible through the other. Work that assumes a single user root may miss user data or create parallel records. |
| `PRODUCTS` and `products` both occur. | App reads and two utilities use `PRODUCTS`; the enhanced/default seeder, legacy batch seeder, and default integration checker use `products`. | A default seed can populate a collection different from the one read by the app. Test success against an environment-variable override does not establish which collection is deployed. |
| Profile data uses both Firestore documents and similarly named Storage keys. | Firestore profile documents and Storage avatar objects both contain `USERS/{uid}/PROFILES/...`. | The shared spelling can obscure service boundaries. Firestore cleanup and Storage cleanup are separate operations with separate failure modes. |
| Cart and shopping lists are different models and paths. | Cart uses `users/{userId}/cart/{productId}`; shopping lists use `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}`. | Planning must not treat “cart”, “shopping list”, and nested `ITEMS` as interchangeable collections. They differ in casing, hierarchy, identifiers, and operations. |
| Identifier names are not uniform. | Product documents are generally addressed as `{barcode}`, while the cart API calls the same lookup value `{productId}`. Shopping-list item IDs are explicitly barcodes. | A future contract trace must preserve this ambiguity until call-site input guarantees are verified; this map does not assume every `productId` is a barcode. |
| User fields and profile fields are split. | Self-profile names are stripped from `PROFILES` and expected from `USERS/{uid}` in `profiles.ts:13-29,68-72,90-94`. | Readers using lowercase `users/{userId}` or only profile documents may observe different or incomplete identity data. This is a behavioural dependency, not a schema proposal. |
| No concrete collection-level rule mapping exists in the checked-in rules. | `firestore.rules` uses only a global recursive match. | Repository rules cannot confirm intended per-path authorization, nor whether deployed rules accept all paths. Security review must use deployed configuration separately. |
| Several write-capable scripts target real Firestore unless dry-run or otherwise isolated. | `seed_firestore.py`, `seed_engine.py`, `batch_seeder.py`, and `test_products.py` contain batch writes. | Verification work can mutate external data if credentials point at a live project. The target project and collection must be confirmed before executing non-dry-run tooling. |

## Preserved unknowns

- Which Firebase project, database, collections, documents, indexes, and security rules are currently deployed is unknown from repository inspection alone.
- Whether deployed data exists under uppercase names, lowercase names, both, or neither is unknown.
- Whether `FIRESTORE_PRODUCTS_COLLECTION` is set in any integration or deployed environment is unknown.
- Whether all listed modules are reachable in the currently shipped application is unknown; this inventory records executable repository references, including legacy and test utilities, rather than inferring runtime reachability.
- No standalone root `PROFILES`, `CART`, `cart`, `SHOPPING_LISTS`, or `ITEMS` collection reference was found. This does not prove that such collections do not exist in Firebase.
- No Firestore path is used by `uploadProfileAvatar.ts`; any relationship between stored avatar URLs and profile document fields is determined by callers and data, not by that helper itself.

## Inventory conclusion

The repository contains five case-sensitive root collection IDs in executable backend-related code: `USERS`, `users`, `PRODUCTS`, `products`, and `FEEDBACK`. It also contains nested `PROFILES`, `SHOPPING_LISTS`, `ITEMS`, and `cart` collections at the paths documented above. This map deliberately records the coexistence of those names without selecting a preferred naming convention or recommending a migration.
