# BE071 — Account-Scoped SQLite Shopping Lists

## Threat addressed

Shopping-list discovery was account-scoped, but single-list and item operations accepted only a `listId`. On a shared device, a stale or known list ID could therefore select or mutate another account's locally cached list.

## Implementation

- Every single-list DAO read now requires `userId` and includes it in the SQL ownership predicate.
- Item reads use a join to `shopping_lists`; item mutations use an ownership check plus an `EXISTS` predicate against `shopping_lists.user_id`.
- Local mutations return a safe rejection result for missing or foreign lists. The hook stops before cloud sync or optimistic state changes when ownership is rejected.
- `loadList` replaces stale state with `null` and an empty item array when the list is missing or foreign.
- Cloud-to-local list upserts cannot transfer an existing local list ID between accounts.

The Firestore hierarchy, offline synchronization design, navigation and list IDs were not changed.

## Validation

`mobile-app/__tests__/shoppingListAccountScope.test.ts` covers owner access, foreign reads, all list/item mutation classes, cloud-upsert ownership, normal owner CRUD and stale-state clearing.

Validation commands:

```text
cd mobile-app
npx tsc --noEmit
npx jest --runInBand
```

## Tracking

- Ticket: BE071
- Pull request: add the PR URL when the implementation branch is published.
