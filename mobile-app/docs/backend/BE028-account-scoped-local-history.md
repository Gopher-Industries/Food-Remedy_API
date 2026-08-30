# BE028 Account-Scoped Local History

## Ownership Policy

Local product history and cached product snapshots are scoped by `owner_scope`.

- Authenticated account history uses `user:<firebase_uid>`.
- Guest history uses `guest:local`.
- Legacy rows migrated from the old device-global schema use `legacy:unowned`.

History reads, cache lookups, deletes, clears, and pruning must use the active
owner scope. Unauthenticated and restoring sessions do not read or write local
history.

## Guest History Policy

Guest history is local to the device under `guest:local`. It is intentionally
separate from authenticated account history and is not imported into an account
when a guest signs in. Logging out of an authenticated account does not expose
that account's history to guest mode.

## Migration Decision

The previous `product_history` table did not store any reliable account or guest
owner. Existing rows are migrated to `legacy:unowned` instead of being assigned
to the next signed-in user. This preserves the rows conservatively while keeping
normal account and guest history queries private by default.
