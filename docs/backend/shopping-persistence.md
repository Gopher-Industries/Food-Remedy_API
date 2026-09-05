# Shopping-list and cart persistence architecture

## Purpose and predecessor review

This document maps the repository's currently evidenced shopping-list and cart persistence paths. It distinguishes local persistence from cross-store behaviour and does not define a replacement architecture.

BE003's submitted sync-coverage artifact ([PR #116](https://github.com/Gopher-Industries/Food-Remedy_API/pull/116), branch commit `d06ae138a6cda7d9f5d0dcc72d8fc4cab71bd677`) was reviewed first. Its relevant finding is confirmed by this trace: shopping lists and items have application-level SQLite/Firestore paths, but their writes are best-effort rather than a durable, conflict-resolving sync protocol. The cart API and DB012 fixture are separate paths and must not be inferred to participate in that list synchronisation.

The source references below were traced from `main` commit `c670d0d02a97a8209182892c34490e2cd77bbc0b`.

## Executive map

| Concern | Local persistence | Firestore persistence | Evidenced relationship / classification |
| --- | --- | --- | --- |
| Shopping-list metadata | Expo SQLite `food_remedy.db`, table `shopping_lists` | `USERS/{uid}/SHOPPING_LISTS/{listId}` | **Implemented best-effort two-way application path.** The hook hydrates cloud lists into SQLite once, and list mutations write SQLite first then attempt Firestore. This is not a proven durable sync protocol. |
| Shopping-list items | Expo SQLite `shopping_list_items`, keyed by `(list_id, barcode)` | `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}` | **Implemented best-effort two-way application path.** The item uses the same local-first/write-attempt pattern as its parent list. |
| Mobile "Shopping Cart" view | No cart table. It projects a shopping list's `is_checked` items and retains `shoppedBarcodes` only in React state. | Indirectly uses the shopping-list item path above when `toggleChecked` attempts a Firestore write. | **A view/state convention, not an independent persisted cart entity.** "Add to Cart" toggles `is_checked`; the cart screen filters checked list items. |
| `/api/shopping-cart-api` items | No Expo SQLite table, DAO, or hook mapping found | `users/{userId}/cart/{productId}` | **Firestore-only API persistence path.** It performs direct CRUD and is not called by the mobile list hook. The lowercase `users` path is also distinct from the uppercase `USERS` list path. |
| DB012 cart integration fixture | Root Node SQLite database `local_cache.db`, with a different `shopping_list_items` schema | None in the DB012 script or its persistence layer | **Local test fixture only.** DB012 adapts a Firestore-shaped product object, but does not perform a Firestore read or write. Its `dirty`/`deleted` columns do not themselves prove an outbox. |

## Data-flow diagram

```mermaid
flowchart TD
  subgraph Mobile[Expo mobile application]
    ListUI[Shopping-list detail UI\nAdd to Cart] --> Hook[useShoppingList]
    CartUI[Shopping Cart detail view] -->|filters is_checked| Hook
    Hook --> DAO[shoppingList.dao.ts]
    DAO --> SQLite[(food_remedy.db\nshopping_lists\nshopping_list_items)]
    Hook -. one-time hydration .-> ListService[shoppingLists Firestore service]
    Hook -. local-first mutation;\nbest-effort write .-> ListService
    Manual[Shopping Lists Sync button] -->|syncAllToFirestore| Hook
    ListService --> ListCloud[(Firestore\nUSERS/{uid}/SHOPPING_LISTS/{listId}\n/ITEMS/{barcode})]
  end

  ProductCloud[(Firestore\nPRODUCTS/{productId})] -->|validates POST only| CartAPI[/api/shopping-cart-api]
  CartAPI --> CartCloud[(Firestore\nusers/{userId}/cart/{productId})]

  DB012[database/db012_cart_integration.js\nFirestore-shaped fixture] --> Legacy[PersistenceLayer_BE03]
  Legacy --> LegacyDB[(local_cache.db\nlegacy shopping_list_items)]

  Note[No repository application caller\nwas found for /api/shopping-cart-api] -.-> CartAPI
```

The Firestore collection names in the diagram preserve source casing. Firestore path segments are case-sensitive, so `USERS/.../SHOPPING_LISTS` and `users/.../cart` must be treated as different paths unless a bridge is implemented and demonstrated.

## Evidenced mobile shopping-list path

### SQLite schema and DAO

- `mobile-app/config/sqlConfig.ts:5-16` opens the Expo database as `food_remedy.db` and enables WAL plus foreign keys.
- `sqlConfig.ts:60-87` creates `shopping_lists` (`list_id`, `user_id`, list presentation fields, and timestamps) and `shopping_list_items`. An item is scoped by `(list_id, barcode)` and its foreign key cascades when the local list is deleted.
- `sqlConfig.ts:100-169` migrates older list/item shapes to the DAO-compatible schema, including `list_name`, `emoji`, `is_checked`, `product_json`, `updated_at`, and `note`.
- `mobile-app/services/sqlDatabase/shoppingList.dao.ts:24-49` creates a list locally with a generated UUID and ISO timestamps. `upsertShoppingList` at lines `54-78` is explicitly the cloud-to-local operation and overwrites a matching local row with incoming values.
- The DAO persists product snapshots in `shopping_list_items`: local add/increment is at `shoppingList.dao.ts:181-239`, and cloud-to-local item upsert is at lines `244-274`. Quantity, note, and checked-state mutations update `updated_at` at lines `309-364`; local deletions are physical deletes at lines `370-403`.

### Cloud list service

- `mobile-app/services/database/user/shoppingLists.ts:25-29` defines the cloud list paths:
  - `USERS/{uid}/SHOPPING_LISTS/{listId}` for list metadata;
  - `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}` for items.
- List creation, reads, updates, and deletes are implemented at `shoppingLists.ts:33-94`. Deleting a list manually deletes its item documents before deleting the list document.
- Item create/increment is at `shoppingLists.ts:98-154`; item read is at lines `156-182`; update/delete/batch-clear operations are at lines `188-245`. Item upsert for the explicit backfill path is at lines `255-273`.
- Cloud reads have compatibility fallbacks, not a durable retry policy: list reads try `getDocsFromServer` and then `getDocs` (`shoppingLists.ts:49-62`); item reads fall back for an unavailable index or cached read (`lines 160-176`).

### Trigger and direction

- `mobile-app/hooks/useShoppingList.ts:84-117` runs once after SQLite and an authenticated user are ready. It reads every cloud list, upserts it locally, reads each cloud item's collection, and upserts the items locally. It marks `hasSyncedFromCloud` true even after a caught cloud-read failure.
- The same hook is local-first for list mutation: create calls the SQLite DAO before `createShoppingListFirestore` (`useShoppingList.ts:131-145`), update does the local update before the Firestore attempt (`151-174`), and delete does the local deletion before its cloud attempt (`180-198`). Failures are logged and leave the local result in place.
- Item add, quantity, note, checked-state, remove, and clear handlers follow the same local-first/attempt-cloud pattern (`useShoppingList.ts:224-417`).
- The Shopping Lists tab exposes a manual **Sync** button that invokes `syncAllToFirestore` (`mobile-app/app/(app)/(tabs)/cart.tsx:229-236`). That helper iterates local lists and items and sends Firestore create/upsert operations (`useShoppingList.ts:468-508`).

### What the mobile UI calls a cart

- The list detail page's "Add to Cart" handlers call `toggleChecked` for selected or single items (`mobile-app/app/(app)/lists/[listId].tsx:222-247`), then navigate to the shopping-cart detail route (`lines 504-517`).
- The cart detail screen loads the same list with `useShoppingList`, uses `currentItems.filter((i) => i.isChecked)`, and toggles that field again to remove an item from the cart (`mobile-app/app/(app)/lists/shopping-cart.tsx:13-18`, `41-67`).
- Its separate `shoppedBarcodes` set is component state only (`shopping-cart.tsx:20-39`); there is no evidence it is written to SQLite or Firestore.

Therefore, in the mobile list flow, `is_checked` is serving as the cart-membership flag. This is a product/UI convention implemented on shopping-list items, not evidence of a separate mobile cart store.

## Evidenced Firestore cart API path

`mobile-app/app/api/shopping-cart-api/route.ts` is a separate HTTP route with GET, POST, PATCH, and DELETE handlers. It does not import the SQLite DAO or the `useShoppingList` hook.

- GET reads `collection(fdb, "users", userId, "cart")` and returns its documents (`route.ts:52-90`).
- POST validates input, validates the product against `PRODUCTS/{productId}`, then creates or increments `users/{userId}/cart/{productId}`. The cart document stores quantity, selected product display fields, and server timestamps (`route.ts:110-191`).
- PATCH updates quantity and `updatedAt` on that same document path (`route.ts:210-255`); DELETE deletes the same document (`route.ts:271-308`).

A repository search for `/api/shopping-cart-api` and `shopping-cart-api` across application TypeScript/TSX found the route definition and documentation references, but no application fetch/client invocation. That absence is only source evidence: it does not rule out an external client, deployed caller, Cloud Function, or untracked code.

There is no source evidence that this API reads or writes `shopping_lists`, `shopping_list_items`, `USERS/{uid}/SHOPPING_LISTS`, or `food_remedy.db`. It must therefore not be described as the synchronization mechanism for the mobile shopping-list cart view.

## DB012 fixture boundary

- `database/db012_cart_integration.js:1-16` identifies DB012 as a local cart/shopping-list integration test and imports `persistenceLayer_BE03.js`.
- It maps hard-coded product objects into a local enriched-item input (`db012_cart_integration.js:26-49`), saves two items, reads them, and asserts local snapshot/classification fields (`lines 51-125`). The word "Firestore" here means product-object shape; this script contains no Firebase import or cloud operation.
- `persistenceLayer_BE03.js:1-7` uses Node `sqlite3` and opens root-level `local_cache.db`, not Expo's `food_remedy.db`.
- Its `shopping_list_items` table has a different key and payload shape (`id` primary key, `user_id`, classification/snapshot fields, `dirty`, and `deleted`) at `persistenceLayer_BE03.js:26-45`. The fixture writes the local record at lines `151-256` and queries it at `258-325`.
- `dirty` and `deleted` are set by the local persistence operations (`persistenceLayer_BE03.js:327-365`), but no upload/outbox consumer is exported by that module (`lines 370-377`) or invoked by DB012. They are not proof of working synchronisation.

This fixture should not be used as evidence that the current Expo shopping-list tables, the Firestore cart API, or a production cloud-sync worker share one schema or data flow.

## Sync and recovery limits

The mobile list/item service is the only proven cross-store path in this trace. Its direction is real but its guarantees are limited:

- Cloud hydration unconditionally upserts cloud values into local SQLite (`useShoppingList.ts:91-105`; `shoppingList.dao.ts:54-78` and `244-274`). It does not compare timestamps before overwriting, and it does not remove local rows missing from a cloud response.
- Local mutations do not wait for a durable acknowledgement. A Firestore failure is caught and logged after the SQLite mutation (`useShoppingList.ts:136-141`, `156-162`, `239-248`, and analogous handlers through line `417`).
- There is no persisted pending-operation table, reconnect listener, automatic retry queue, tombstone reconciliation, or demonstrated cross-device conflict policy in the traced code.
- The manual backfill button is an operator/user trigger, not evidence of automatic recovery. Its per-list failure handling logs and continues (`useShoppingList.ts:476-506`).

Accordingly, the supported classification is **best-effort bidirectional application writes for shopping lists/items**, not reliable offline synchronization. The API cart and DB012 fixture are not part of that classification.

## Unresolved questions

1. Is `users/{userId}/cart/{productId}` intended to replace, mirror, or remain independent from `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}`? No mapper, shared caller, or migration is present in this repository.
2. Is `is_checked` intentionally the cart-membership field, or should it represent a completed/purchased state? The mobile UI currently uses it for both "Add to Cart" and removal from the cart view, while the separate `shoppedBarcodes` state is ephemeral.
3. What recovery and conflict policy is required when a SQLite-first list/item change cannot reach Firestore, or when another device changes the same item? The current code supplies no durable queue, timestamp comparison, deletion tombstone, or retry contract.
4. Is DB012 an active production persistence contract or a historical/local-backend test harness? Its database file, schema, and Node runtime differ from the mobile app, and the `dirty`/`deleted` markers have no demonstrated consumer.
5. Should the cart API route have a mobile caller? The route and API documentation exist, but no in-repository application caller was found by the source search described above.
6. Are Firestore rules, external clients, Cloud Functions, or deployment configuration providing ownership, retry, or case-normalisation behaviour outside this repository? No such guarantee is demonstrated by this trace.

## Evidence-backed follow-up tickets

1. **Decide and document the relationship between the Firestore cart API and mobile shopping lists.** Choose whether `users/{userId}/cart` is independent, a migration target, or a projection; define ownership and a data mapping before connecting them. Evidence: the paths, schemas, and application callers are disjoint in the sections above.
2. **Define durable shopping-list offline recovery and conflict semantics.** Specify queued operations, retry triggers, cloud/local ordering, deletion handling, and multi-device conflict resolution before changing sync code. Evidence: immediate caught writes and unconditional hydration in `useShoppingList.ts:84-117` and `131-417`.
3. **Clarify mobile cart state semantics.** Decide whether `is_checked` means cart membership, purchased, or both; persist or intentionally discard the separate `shoppedBarcodes` state accordingly. Evidence: list/cart UI call sites cited in the mobile cart section.
4. **Classify or retire the DB012 persistence harness.** Record whether `persistenceLayer_BE03.js` is a supported backend contract, and if so, define its relationship to Expo SQLite and any `dirty`-record sender. Evidence: `local_cache.db` and its distinct schema in `persistenceLayer_BE03.js:1-45` and `151-377`.

## Verification

- Reviewed BE003's submitted sync-coverage artifact and its shopping-list/item evidence before tracing this document.
- Traced the Expo schema, DAO, hook, Firestore list service, list/cart UI, cart API route, DB012 script, and its Node persistence layer cited above.
- No application code, schema, live data, or sync behaviour was changed. The DB012 script was not executed because it writes to `local_cache.db`; this ticket delivers a source-backed architecture map only.
