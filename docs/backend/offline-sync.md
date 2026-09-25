# Firebase–SQLite offline sync coverage

## Purpose and method

This map records what the mobile application source proves about the boundary between Firebase Firestore and the on-device Expo SQLite database. It covers every user-facing entity defined in `mobile-app/config/sqlConfig.ts`, plus the Firestore product catalogue that is stored as local snapshots. It does not infer Firebase SDK offline persistence, backend jobs, or behaviour outside this repository.

In this document, **synchronised** means application code reads and/or writes the same logical entity in both stores. A SQLite table by itself is only local persistence; it is not evidence of cloud synchronisation.

Classification is based on the checked-in source at `main` commit `c670d0d`, traced through the DAO, Firestore service, hook/provider, and test call sites.

## Classification table

| Entity | Firebase presence | SQLite presence | Classification | Direction and trigger | Conflict and retry behaviour |
| --- | --- | --- | --- | --- | --- |
| Nutritional profiles (including the `demographics` profile) | `USERS/{uid}/PROFILES/{profileId}` is read and written by the profile Firestore service and the profile sync service. | `profiles` table, including demographic columns added by migration. | **Implemented, bidirectional, but inconsistent.** There are multiple sync/write paths rather than one canonical protocol. | Authentication invokes `syncProfiles(uid)`; `ProfileProvider` also performs a one-time cloud-to-local reconciliation. Profile screens directly write local data and then attempt a Firestore write. | The generic sync service intends last-write-wins using `updated_at` and retries three times. Other paths treat Firestore as authoritative or perform a one-shot best-effort write. Timestamp field names and the SQLite mapper do not preserve the generic sync timestamp, so end-to-end last-write-wins is not established. |
| Shopping lists | `USERS/{uid}/SHOPPING_LISTS/{listId}` is read and written by a dedicated Firestore service. | `shopping_lists` table and DAO. | **Implemented, best-effort bidirectional.** | On first ready hook run, cloud lists are upserted locally. Create/update/delete write SQLite first, then immediately attempt Firestore. The Cart screen exposes a manual backfill action. | Cloud hydration overwrites matching local rows without a timestamp comparison. Failed writes are logged and discarded; there is no durable outbox or automatic retry. |
| Shopping-list items | `USERS/{uid}/SHOPPING_LISTS/{listId}/ITEMS/{barcode}` is read and written by the same Firestore service. | `shopping_list_items` table and DAO. | **Implemented, best-effort bidirectional.** | The shopping-list hydration loop reads every cloud list's items and upserts them locally. Item mutations write SQLite first, then attempt the matching Firestore operation. | As for lists: cloud upsert has no comparison, absent cloud items do not remove local items, and failed writes are not queued or retried. `addItemToListFirestore` has a single write fallback, not a retry policy. |
| Product favourites | No user-favourites Firestore collection, document path, or Firestore DAO operation was found in the application TypeScript/TSX source. | `product_favourites` table, `favourites.dao.ts`, and `useFavourites`. | **SQLite local-only; not synchronised.** | Local hook operations call only the SQLite DAO. | No cross-store conflict or retry behaviour exists because no cloud path exists in this source. |
| Product history / product snapshot cache | No user-history Firestore collection, document path, or Firestore DAO operation was found in the application TypeScript/TSX source. | `product_history` table, `history.dao.ts`, `useHistory`, and `ProductProvider`. | **SQLite local-only; not synchronised.** The stored product JSON is a cache/history snapshot, not a mirror of a Firebase history record. | Viewing a product upserts its local history row; reads may use that row before fetching the product catalogue. | No cross-store conflict or retry behaviour exists. The table is not user-scoped: its primary key is only `barcode`. |
| Product catalogue | `PRODUCTS/{barcode}` is read from Firestore. | No catalogue table exists; product JSON is embedded in the three local user/cache tables above. | **Firebase-read / local snapshot cache only; not an entity sync protocol.** | `ProductProvider` checks a history snapshot, then fetches Firestore when absent or forced. | Fresh catalogue data is not written back to a standalone SQLite catalogue, and no reconciliation policy is present. |

## Evidence by entity

### Profiles

Firebase path and service:

- `mobile-app/services/database/user/profiles.ts:8-9` constructs `USERS/{uid}/PROFILES` references. `createUserProfile`, `listUserProfiles`, `upsertUserProfile`, and `deleteUserProfile` perform Firestore CRUD at lines `34-105`.
- `mobile-app/services/sync/syncProfilesServices.ts:42-54` fetches that collection, and lines `106-122` write SQLite profiles to the same Firestore path.

SQLite persistence:

- `mobile-app/config/sqlConfig.ts:19-34` creates `profiles`; lines `171-184` add the demographic fields.
- `mobile-app/services/sqlDatabase/profiles.dao.ts:43-96` creates/upserts profiles and lines `165-183` lists them by user.

Direction and trigger:

- `mobile-app/components/providers/AuthProvider.tsx:49-53` calls `syncProfiles(user.uid)` after authentication.
- `syncProfiles` fetches both stores, merges by `profileId`, writes the merged result locally, then writes changed records to Firestore (`mobile-app/services/sync/syncProfilesServices.ts:144-212`).
- Separately, `mobile-app/components/providers/ProfileProvider.tsx:168-200` reads Firestore once, deletes local profiles absent from Firestore, then upserts cloud profiles locally. Screen save paths also write SQLite first and then attempt `upsertUserProfile`; see `mobile-app/components/ProfileCreateForm.tsx:94-121` and `mobile-app/app/(app)/membersEdit.tsx:134-141`.
- The demographics screen explicitly writes Firestore and then mirrors to SQLite (`mobile-app/app/(app)/demographics.tsx:160-180`).

Conflict and retry findings:

- The generic service's `resolveConflict` compares `updated_at` and selects the later timestamp (`syncProfilesServices.ts:127-137`). Its retry helper makes three attempts with exponential delay and is used for profile reads and writes (`lines 23-37`, `47`, `111-121`, and `197-203`).
- This is not a dependable repository-wide last-write-wins guarantee. Firestore profile CRUD uses `updatedAt` (`services/database/user/profiles.ts:36-42`, `61-66`, and `82-88`), whereas the generic service uses `updated_at` (`syncProfilesServices.ts:17`, `91`, `116`, `133-134`, and `192-193`). Also, `rowToProfile` does not return either SQLite timestamp (`profiles.dao.ts:14-31`), and `upsertProfile` generates a new `updated_at` rather than accepting the incoming value (`profiles.dao.ts:68-96`).
- `ProfileProvider` instead makes Firestore authoritative for a one-time reconcile and removes local-only profiles (`ProfileProvider.tsx:175-190`). Direct profile screen writes catch and log one failed Firestore save (`ProfileCreateForm.tsx:115-120`), rather than using the generic retry helper. These paths can therefore disagree about ownership and failure handling.

### Shopping lists and items

Firebase and SQLite storage:

- `mobile-app/services/database/user/shoppingLists.ts:19-22` defines the `SHOPPING_LISTS` and nested `ITEMS` Firestore paths. Its list CRUD operations are at lines `26-87`; item CRUD and batch delete operations are at lines `91-250`.
- `mobile-app/config/sqlConfig.ts:61-87` creates the `shopping_lists` and `shopping_list_items` tables. The local upserts used by hydration are `shoppingList.dao.ts:54-78` and `244-274`.

Direction and trigger:

- `mobile-app/hooks/useShoppingList.ts:84-117` performs a one-time cloud-to-local hydration after a database and authenticated user are ready. It reads every cloud list, then every item, and upserts each result locally.
- Local list mutations persist first and then attempt Firestore: create (`lines 131-145`), update (`151-174`), and delete (`180-198`). Item add, quantity, note, checked state, and deletes use the same SQLite-first / Firestore-second pattern (`224-417`).
- The Cart screen's **Sync** button calls `syncAllToFirestore` (`mobile-app/app/(app)/(tabs)/cart.tsx:229-236`), which performs a manual local-to-cloud backfill (`useShoppingList.ts:468-508`).

Conflict and retry findings:

- Hydration calls unconditional local UPSERTs (`useShoppingList.ts:91-105`); the local DAO applies the incoming cloud values without comparing `updatedAt` (`shoppingList.dao.ts:54-78` and `244-274`). It does not delete local lists/items that are absent from a cloud read. This is not last-write-wins or full deletion reconciliation.
- Firestore write failures are caught, logged, and do not prevent the local mutation (`useShoppingList.ts:136-141`, `156-162`, `239-248`, and analogous item handlers). There is no persisted pending-operation queue or automatic retry. After a cloud-read failure, `hasSyncedFromCloud` is still set to true (`lines 107-111`), preventing another automatic hydration for that hook instance.
- Reads have compatibility fallbacks, not retries: list reads fall back from `getDocsFromServer` to `getDocs` (`shoppingLists.ts:40-46`), and item reads can fall back when an index is unavailable (`lines 142-161`). `addItemToListFirestore` has one fallback `setDoc` after an error (`lines 100-136`), but other writes have no corresponding retry policy.

### Favourites

- `mobile-app/config/sqlConfig.ts:37-47` creates the user-scoped `product_favourites` table.
- `mobile-app/services/sqlDatabase/favourites.dao.ts:14-135` implements only SQLite reads and writes. `mobile-app/hooks/useFavourites.ts:8-11` imports only that DAO, and its mutation calls at lines `36-107` do not call a Firestore service.
- A source search for `product_favourites`, `USERS/.../FAVOURITES`, `USERS/.../FAVORITES`, and Firestore operations finds no user-favourites cloud mapping. The Firestore `PRODUCTS` catalogue is separate and must not be treated as a favourites sync target.

### History and product snapshots

- `mobile-app/config/sqlConfig.ts:50-58` defines `product_history` with `barcode` as its only primary key; there is no `user_id` column.
- `mobile-app/services/sqlDatabase/history.dao.ts:21-115` is SQLite-only. `mobile-app/hooks/useHistory.ts:17-60` and `mobile-app/components/providers/ProductProvider.tsx:67-93` call it for local history writes.
- `ProductProvider` uses a history entry as a cache before fetching `PRODUCTS/{barcode}` from Firestore (`ProductProvider.tsx:141-154` and `services/database/products/getProductById.ts:11-24`). This read-through behaviour does not write a Firestore history entity or establish bidirectional product synchronisation.

## Unresolved questions

1. Is the intended authoritative profile timestamp `updatedAt` or `updated_at`, and should Firestore-authoritative reconciliation or timestamp last-write-wins win when they differ?
2. Are shopping lists expected to be durable offline-first data? The source has immediate best-effort writes but no outbox, reconnect trigger, or automatic retry after a failed hydration/write.
3. What policy should resolve a shopping-list change made on two devices before the next cloud hydration, including deletes? Current source has no timestamp comparison or tombstones.
4. Are favourites and history intentionally device-local? If history is intended to be per user, the current primary key and DAO signatures do not encode a user boundary.
5. Does any backend job, security rule, Cloud Function, or native Firebase persistence configuration outside this repository supply guarantees not visible here? None is demonstrated by this trace.

## Evidence-backed follow-up tickets

1. **Define and test one profile synchronization contract.** Align the Firestore and SQLite timestamp field/mapping, decide one source-of-truth rule, and add integration tests through the real DAO. Evidence: `updatedAt`/`updated_at` mismatch and discarded SQLite timestamps cited in the Profiles section.
2. **Add durable shopping-list sync recovery and conflict semantics.** Specify pending-operation persistence, reconnect/foreground retry, deletion reconciliation, and a timestamp or revision policy; cover them with offline and multi-device tests. Evidence: unconditional cloud hydration and caught, non-queued write failures in `useShoppingList.ts:84-117` and `131-417`.
3. **Decide favourites and history cloud requirements.** Record whether each entity is intentionally local-only. If cross-device persistence is required, define a user-scoped Firestore schema, migration/privacy policy, and sync tests. Evidence: the SQLite-only DAO/hook references above and no Firestore path in this repository.
4. **Scope history to an authenticated user or explicitly document its device-wide policy.** If history must be private per account, add a user key and migration as a separate schema ticket. Evidence: `product_history` has a barcode-only primary key in `sqlConfig.ts:50-57` and all history DAO methods omit `userId`.
5. **Repair the profile-sync suite's timing and conditional-write assertions.** Make retry timing testable without exceeding Jest's default timeout and align expected `setDoc` calls with `syncProfiles`' `hasChanged` condition. Evidence: on 2026-07-28, the focused suite had 18 passing and 3 failing tests; `profileSync.test.ts:314-330` and `587-605` expect writes for cloud records that `syncProfilesServices.ts:190-203` deliberately skips when unchanged.

## Verification

- Source tracing covered the configured SQLite tables, their DAOs, the Firebase services, and the provider/hook call sites listed above.
- Ran `npm test -- --runInBand __tests__/profileSync.test.ts` in `mobile-app` on 2026-07-28. The unmodified source suite reported **18 passing / 3 failing** tests. One failure is the expected retry delay exceeding Jest's five-second test timeout; two expect 2 or 3 Firestore writes although the current `hasChanged` guard only writes the one local-only record. This BE003 change adds documentation only; no application code or test code was altered.
- The suite is mocked and does not cover the separate `ProfileProvider` reconcile or shopping-list/favourites/history flows, which is why the follow-up tickets include integration coverage.
