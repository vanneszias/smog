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

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.gestures.list` | `{ q?, status?: "all" \| "published" \| "unpublished" (= "all"), category?: string[] (ids), cursor?, limit? (1..100, = 50) }` | `{ items: AdminGestureRow[], nextCursor: string \| null, counts: { total, published, unpublished } }` | read |
| `admin.gestures.get` | `{ id }` | `AdminGestureDetail` | read |
| `admin.gestures.checkName` | `{ name, excludeId? }` | `{ duplicates: { id, name, slug }[] }` | read |
| `admin.gestures.create` | `{ name, description?, keywords?, categoryIds, playbackId, muxAssetId?, published? (= true) }` | `AdminGestureDetail` | `gesture.create` |
| `admin.gestures.update` | `{ id, expectedUpdatedAt, name?, description?, keywords?, categoryIds?, playbackId?, muxAssetId? (null clears) }` | `AdminGestureDetail` | `gesture.update` |
| `admin.gestures.saveMany` | `{ items: { id, expectedUpdatedAt, patch }[] (1..50) }` | `{ items: AdminGestureRow[] }` | `gesture.update` per row |
| `admin.gestures.setPublished` | `{ id, published }` | `AdminGestureDetail` | `gesture.publish` / `gesture.unpublish` |
| `admin.gestures.bulkUpdate` | `{ ids (1..100), published?, addCategoryIds?, removeCategoryIds? }` | `{ updated }` | one `gesture.bulk_update` (`target_id` NULL) |
| `admin.gestures.delete` | `{ id, confirmName }` | `{ id }` | `gesture.delete` |

- `AdminGestureRow` is `{ id, slug, name, playbackId, muxAssetId, publishedAt, updatedAt, categories: { id, name, slug, published }[], keywords: string[] }` (epoch milliseconds; every category, published or not, in category order). `AdminGestureDetail` adds `description` and `createdAt`. Reads come from D1, never the catalog snapshot.
- `list` is `sort_name, id` order, a keyset page at a time (index `gesture_sort_name_idx`, migration 0006). `q` matches a `normalizeText` substring of the name or of a keyword; `counts` apply `q` and `category` but not `status`. A foreign cursor is `VALIDATION`.
- Limits (ruling 8): the name 1..120 characters after trimming, the description ≤ 2000, ≤ 30 keywords of 1..60 characters (de-duplicated by `normalizeText`), 1..20 categories. Unknown categories are `VALIDATION`; an unknown gesture is `NOT_FOUND`. The slug is set at create (`-2`, `-3`, … on a collision) and never changes.
- Every write is one D1 batch (the change, the gesture's `gesture_fts` rows and the audit entry), then bumps `catalog:version`; a KV failure is logged, and the call still succeeds.
- `CONFLICT` carries `{ reason, ids? }`: `stale` (the ids changed since `expectedUpdatedAt`; nothing was written, `saveMany` is all or nothing), `published` / `sponsored` (`delete`: unpublish first; a sponsored gesture is never deleted).
- `VALIDATION`: an empty `update` patch, a `bulkUpdate` with nothing to change or a category both added and removed, a `delete` whose `confirmName` differs from the name. `INVALID_STATE`: `setPublished` to the current state, a `bulkUpdate` that would leave a gesture without a category.

### Categories

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.categories.list` | none | `AdminCategory[]` (≤ 100) | read |
| `admin.categories.create` | `{ name, published? (= true) }` | `AdminCategory` | `category.create` |
| `admin.categories.update` | `{ id, expectedUpdatedAt, name }` | `AdminCategory` | `category.update` |
| `admin.categories.setPublished` | `{ id, published }` | `AdminCategory` | `category.publish` / `category.unpublish` |
| `admin.categories.reorder` | `{ ids }` (every category, in the new order) | `AdminCategory[]` | one `category.reorder` (`target_id` NULL) |
| `admin.categories.delete` | `{ id }` | `{ id }` | `category.delete` |

- `AdminCategory` is `{ id, slug, name, sortOrder, publishedAt, updatedAt, gestureCount, publishedGestureCount }`, by `sort_order` then name, read from D1 (never `gestures.categories`).
- Names are 1..60 characters; a `normalizeText`-equal name is `CONFLICT` `duplicateName`. The slug stays on rename. `create` appends to the order, and refuses a 101st category (`INVALID_STATE`).
- A rename, publish or unpublish rebuilds the `gesture_fts` rows of every gesture in the category in the same batch. Every write bumps `catalog:version`.
- `update` is `CONFLICT` `stale` when the category changed since `expectedUpdatedAt`. `delete` is `CONFLICT` `inUse` while any gesture has the category (unpublish it instead). `reorder` is `INVALID_STATE` unless `ids` is exactly the current set; it sets `sort_order` 0..n-1. `setPublished` to the current state is `INVALID_STATE`.

### Mux

Task 3.

### Users

Task 5.

### Maintenance

Task 6.

### Emails

Task 6.
