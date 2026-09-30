# API

The oRPC procedures of `appContract` (`@smog/api`), served at `/api/rpc`.
Every procedure declares the
shared error map (`@smog/rpc/contract` `ERRORS`); the codes each one adds are
listed with it. The public, account, favorites and lists procedures are
documented in their contracts (`packages/features/*/src/contract.ts`); phase 5
task 7 backfills them here.

## `admin.*` (`@smog/admin`)

Every admin procedure needs the admin role: `UNAUTHORIZED` for a guest,
`FORBIDDEN` for a signed-in user. The role is read from D1 on every request,
so a demotion applies to the next call. Each procedure has a kind in its
slice's `ADMIN_PROCEDURES`: a read cannot write D1 or KV, a mutation writes
one audit entry per target with its mapped action (`audit_log`, in the same
D1 batch as the change, or right after an external change), and an exempt
mutation says why it writes none. `adminProcedure` enforces the kind on every
call (a broken rule is `INTERNAL_SERVER_ERROR`, logged). One section per
area; each task fills its own.

### Dashboard

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.dashboard` | none | `{ gestures: { total, published, unpublished }, categories: { total, published }, users: { total, admins, banned, last30Days }, recentAudit: AuditEntry[≤5] }` | read |

One D1 batch. `banned` counts bans that have not expired; `last30Days` counts
accounts created in the last 30 days. Phase 6 adds the sponsorship stats.

### Audit log

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.audit.list` | `{ action?, targetType?, targetId?, actorId?, from?, to?, cursor?, limit? }` | `{ items: AuditEntry[], nextCursor: string \| null }` | read |
| `admin.audit.actors` | none | `{ actors: { id, name }[] (≤ 100, by name), truncated }` | read |

- `AuditEntry` is `{ id, action, targetType, targetId, data, actor: { id, name } | null, createdAt }`. `createdAt` is epoch milliseconds; `actor` is `null` once the account is deleted (the entries stay). `data` is parsed with its action's schema (`AUDIT_DATA_SCHEMAS`) when it has one, else returned as stored.
- `list` is newest first, a keyset page (`created_at, id`) at a time. `limit` is 1..100 (default 50). `from`/`to` are inclusive epoch milliseconds (`from` ≤ `to`, else `BAD_REQUEST`). A `targetId` needs its `targetType` (else `BAD_REQUEST`). A cursor the list did not issue is `VALIDATION` (`fieldErrors.cursor`). Every filter seeks an index ending in `created_at` (migration 0005), so a page costs its limit, not the matching rows.
- `actors` lists every admin and every account with audit entries, for the actor filter; `truncated` is `true` past 100.

### Gestures

Task 2.

### Categories

Task 2.

### Mux

Task 3.

### Users

Task 5.

### Maintenance

Task 6.

### Emails

Task 6.
