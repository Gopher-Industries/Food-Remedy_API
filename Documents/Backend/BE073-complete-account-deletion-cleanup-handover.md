# BE073 – Complete Account Deletion Cleanup Handover

## Original problem

`deleteUserAccountData(uid)` (`mobile-app/services/database/user/deleteUserAccount.ts`)
deleted profile Storage assets, each `USERS/{uid}/PROFILES/{profileId}` document
(with its `PERSONALIZATION`/`SAVED_INTENTS`/`RECOMMENDATION_*` children via
`deleteCloudProfilePersonalization`) and the main `USERS/{uid}` document, then
cleared local `profiles` rows. Two account-scoped cloud surfaces and several
local tables were never touched, so they could survive account deletion and
become orphaned once the Firebase Auth user was gone:

- `USERS/{uid}/SHOPPING_LISTS/{listId}` and its `ITEMS/{itemId}` subcollection.
- The legacy `users/{uid}/cart/{productId}` collection still served by
  `app/api/shopping-cart-api/route.ts`.
- Local SQLite `product_favourites`, `product_history` and `shopping_lists`
  (+ `shopping_list_items`) rows for the deleted account.

## Data surfaces discovered during inspection

Inspected `firestore.rules`, `sqlConfig.ts`, all `services/sqlDatabase/*.dao.ts`
files and the migration files before changing anything:

| Surface | State found | Action taken |
|---|---|---|
| `USERS/{uid}` main doc | Deleted | Unchanged |
| `USERS/{uid}/PROFILES/{id}` + avatar Storage | Deleted, correctly ordered | Unchanged |
| `PROFILES/{id}/PERSONALIZATION`, `SAVED_INTENTS`, `RECOMMENDATION_SESSIONS`, `RECOMMENDATION_EVENTS` | Deleted via `deleteCloudProfilePersonalization` | Unchanged |
| `USERS/{uid}/SHOPPING_LISTS` + `ITEMS` | **Not deleted** | Added |
| `users/{uid}/cart` (legacy) | **Not deleted** | Added |
| Local `profiles` | Cleared via `clearProfilesForUser` | Unchanged |
| Local `profile_preferences`, `saved_shopping_intents`, `recommendation_event_outbox` | **Already covered** — each has `FOREIGN KEY (user_id, profile_id) REFERENCES profiles(...) ON DELETE CASCADE`, and `sqlConfig.ts` sets `PRAGMA foreign_keys = ON`, so `clearProfilesForUser` already cascades them | No change needed; documented here rather than duplicated |
| Local `product_favourites` | `clearFavourites(db, userId)` existed but was never called from account deletion | Wired in |
| Local `product_history` | `clearHistory(db, ownerScope)` existed but was never called; needs `getAuthenticatedHistoryOwnerScope(uid)` to build the `user:{uid}` scope | Wired in |
| Local `shopping_lists` / `shopping_list_items` | No user-scoped bulk delete existed; items already cascade from `shopping_lists` via `ON DELETE CASCADE` | Added `clearShoppingListsForUser(db, userId)` |

## Implementation summary

1. **`services/database/user/shoppingLists.ts`**
   - Fixed `deleteShoppingListFirestore` to chunk item deletes in batches of
     450 instead of one unbounded batch (Firestore's write-batch limit is 500
     operations; large lists would previously fail silently above that).
   - Added `deleteAllShoppingListsFirestore(uid)`, which enumerates the
     account's lists and deletes each one's items then its parent doc via the
     existing helper.
2. **`services/database/user/legacyCart.ts`** (new) — `deleteLegacyCartData(uid)`
   enumerates `users/{uid}/cart` and deletes it in the same chunked-batch
   pattern.
3. **`services/sqlDatabase/shoppingList.dao.ts`** — added
   `clearShoppingListsForUser(db, userId)`: a single `DELETE FROM
   shopping_lists WHERE user_id = ?`; items cascade via the existing FK.
4. **`services/database/user/deleteUserAccount.ts`** — orchestrates the full
   sequence (see below); no change to the existing profile-storage/profile-doc
   logic, only additions around it.
5. **`app/(app)/accountProfile.tsx`** — swapped the raw `console.error` in the
   deletion failure handler for `logSafeError` (the BE072 redaction helper),
   so a genuine deletion failure never logs raw Firebase error content. The
   user-facing behaviour (generic "Failed to delete account" message, dialog
   state reset) is unchanged.

## Final deletion sequence

`deleteUserAccountData(uid)`, invoked by `accountProfile.tsx` **before**
`deleteUser(user)`:

1. `deleteUserProfilesStorage(uid)` — Storage avatars, while the session is
   still authenticated.
2. For each `PROFILES` doc: `deleteCloudProfilePersonalization` (its
   `PERSONALIZATION`/`SAVED_INTENTS`/`RECOMMENDATION_*` children), then batch
   deletes the profile doc itself.
3. `deleteAllShoppingListsFirestore(uid)` — every `SHOPPING_LISTS` doc's
   `ITEMS` subcollection, then the list doc.
4. `deleteLegacyCartData(uid)` — legacy `cart` subcollection.
5. `deleteDoc(USERS/{uid})` — main user document.
6. `clearFavourites`, `clearHistory`, `clearShoppingListsForUser`,
   `clearProfilesForUser` against the local SQLite database (favourites and
   history first, shopping lists next, profiles last so its FK cascade to
   preferences/saved-intents/outbox rows happens after everything else that
   doesn't depend on it).

`accountProfile.tsx` awaits this whole sequence, then calls `deleteUser(user)`
only if it resolved. If it throws, `deleteUser()` is never reached and the
existing `auth/requires-recent-login` handling and generic failure
notification are unchanged.

## Firestore cleanup coverage

- `USERS/{uid}/PROFILES/*` and children — unchanged, pre-existing.
- `USERS/{uid}/SHOPPING_LISTS/*` and `ITEMS/*` — new, chunked in batches of 450.
- `users/{uid}/cart/*` — new, chunked in batches of 450.
- `USERS/{uid}` — unchanged, pre-existing.
- Every path is built from the `uid` argument only; no cross-account query is
  possible by construction, and `firestore.rules` independently restricts all
  of these paths to `owner(uid)`.

## Firebase Storage cleanup coverage

No changes. `deleteUserProfilesStorage` already recursively deletes
`USERS/{uid}/PROFILES/**` and already tolerates missing objects/folders
(`listAll` on an absent prefix returns an empty listing rather than throwing).

## SQLite cleanup coverage

- `product_favourites` — `clearFavourites(db, uid)` (pre-existing function, now called).
- `product_history` — `clearHistory(db, getAuthenticatedHistoryOwnerScope(uid))`
  (pre-existing functions, now called; guest-scope history is untouched by
  design since it isn't tied to this account).
- `shopping_lists` / `shopping_list_items` — new `clearShoppingListsForUser`;
  items cascade via the pre-existing `ON DELETE CASCADE` FK.
- `profiles` — pre-existing `clearProfilesForUser`.
- `profile_preferences`, `saved_shopping_intents`, `recommendation_event_outbox`
  — no new code; already cascade from the `profiles` delete via their FKs,
  given `PRAGMA foreign_keys = ON` is set once per connection in `sqlConfig.ts`
  and `initialiseSQLiteDatabase()` reuses a single cached connection.
- No global wipe: every statement is `WHERE user_id = ?` (or cascades from a
  row scoped that way). A second account's rows are never referenced.

## Account-isolation protection

- Every new/changed function takes `uid`/`userId` as its only account
  parameter and scopes all reads/writes to paths or `WHERE` clauses built
  from it.
- `mobile-app/__tests__/deleteUserAccount.test.ts` asserts that deleting two
  different uids in sequence calls every cleanup function with the matching
  uid each time and never mixes them.
- `mobile-app/__tests__/accountDeletionCloudCleanup.test.ts` asserts the
  Firestore collection paths built during cleanup always contain the target
  uid.
- `mobile-app/__tests__/shoppingListAccountScope.test.ts` (BE071) gained a
  case asserting `clearShoppingListsForUser` only ever deletes rows for the
  account passed in.
- BE071's existing per-operation ownership checks in `shoppingList.dao.ts`
  (`ownsShoppingList`, `WHERE ... user_id = ?`) are unchanged.

## Idempotency / retry behaviour

- Firestore: `deleteDoc` on a missing document and `getDocs` on an empty/absent
  collection are no-ops in the Firestore SDK; the new code never branches on
  "does this exist" before deleting, so a second run after a partial failure
  simply finds fewer or no documents and completes.
- Local SQLite: every clear is an unconditional `DELETE ... WHERE user_id = ?`
  (or the equivalent existing function); running it again against already-empty
  tables is a no-op.
- A genuine failure in any step (mocked as a rejected promise in tests)
  propagates out of `deleteUserAccountData` and prevents every subsequent step,
  including the final `USERS/{uid}` doc delete and all local clears — so
  `deleteUser(user)` in `accountProfile.tsx` is never reached on a real
  failure. Verified for: shopping-list cleanup failure, cart cleanup failure,
  and main user-document deletion failure.
- Retry-after-partial-failure is covered directly: a test fails the cart step
  once, asserts local cleanup did not run, then reruns the whole function and
  asserts it completes and reaches local cleanup.

## Tests

- `mobile-app/__tests__/deleteUserAccount.test.ts` (extended) — new cases for:
  cloud shopping-list/cart cleanup ordered before the main user-doc delete;
  local favourites/history/shopping-lists/profiles cleanup ordered after it
  and scoped to `uid`; failure in shopping-list cleanup, cart cleanup, or the
  main user-doc delete each block every later step; account isolation across
  two different uids; safe retry after a fully successful run and after a
  partial failure.
- `mobile-app/__tests__/personalizationDeletion.test.ts` (extended) — added
  mocks for the new modules so the existing BE059 assertions keep passing
  unchanged, plus an assertion that shopping-list/cart cleanup is invoked for
  the account.
- `mobile-app/__tests__/accountDeletionCloudCleanup.test.ts` (new — no prior
  suite covered this module) — batch chunking above/below the 450-op limit for
  both shopping-list items and legacy cart items, idempotency on empty/missing
  collections, and that every collection path touched contains the target uid.
- `mobile-app/__tests__/shoppingListAccountScope.test.ts` (BE071, extended) —
  one new case for `clearShoppingListsForUser` isolation.

## Validation results

- `npx tsc --noEmit` — clean, no errors.
- Focused run (`deleteUserAccount`, `personalizationDeletion`,
  `accountDeletionCloudCleanup`, `shoppingListAccountScope`,
  `historyAccountScope`) — 5 suites, 46 tests, all passing.
- Full `npx jest` — 56 suites passed, 5 pre-existing skipped, 520 tests
  passed, 0 failures.
- `npx eslint` on every changed/added file — 0 errors. Remaining warnings are
  either pre-existing in files this change did not touch the relevant lines
  of (`shoppingLists.ts`: unused `uuidv4` import and an unused catch binding,
  both outside the diff) or the same `import/first` style warning the
  `jest.mock`-before-`import` pattern already produced in
  `personalizationDeletion.test.ts` before this change.
- `git diff --check` — no whitespace errors.

## Known limitations

- There is no automated test that exercises `accountProfile.tsx`'s
  `handleDeleteAccount` handler directly (it would require mocking Expo
  Router, the notification provider and Firebase Auth together). The
  ordering guarantee it depends on — data cleanup awaited and unwound to the
  outer `catch` before `deleteUser(user)` is ever reached — is unchanged
  code and is covered indirectly by the `deleteUserAccountData` failure-path
  tests, which prove a genuine error stops the sequence before it returns.
- Guest-local (non-authenticated) history and any device-local data not tied
  to `user:{uid}` is intentionally left untouched by design; it never
  belonged to the deleted account.
- This does not add a server-side reconciliation/audit job for orphaned data
  from *before* this change; it only ensures future deletions are complete.
  That was explicitly out of scope (no admin/global cleanup service).

## Pull request

_Placeholder — PR URL to be added after review._
