# Database Schema

> Last updated: March 18, 2026  
> See also: [SYNC_STRATEGY.md](./SYNC_STRATEGY.md), [DATA_FLOW.md](./DATA_FLOW.md)

## Overview

SMOG uses two databases:

1. **Convex** — cloud database, source of truth for all data
2. **SQLite** — local on-device cache for the native app (offline-first)

---

## Convex Schema (`packages/convex/convex/schema.ts`)

### `categories`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"categories">` | Auto-generated document ID |
| `_creationTime` | `number` | Unix ms, auto-set by Convex |
| `name` | `string` | Category name (unique) |
| `isActive` | `boolean` | Whether to show in app |

**Indexes:** `by_name`

---

### `gestures`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"gestures">` | Auto-generated document ID |
| `name` | `string` | Gesture name |
| `categoryIds` | `Id<"categories">[]` | References to categories |
| `playbackId` | `string` | MUX playback ID for the gesture video |
| `concept` | `string[]` | Related concepts / synonyms |
| `info` | `string` | Additional description |
| `isActive` | `boolean` | Whether to show in app |
| `lastUpdated` | `number` | Unix ms timestamp of last edit |

**Indexes:** `by_name`, `by_category`, `by_active`, `by_last_updated`  
**Search index:** `search_content` on `name` (filter: `categoryIds`, `isActive`)

---

### `users`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"users">` | Auto-generated document ID |
| `workosId` | `string?` | WorkOS user ID (authenticated users) |
| `guestId` | `string?` | Anonymous guest ID |
| `email` | `string?` | User email |
| `role` | `"user" \| "admin"?` | Role for admin access |
| `createdAt` | `number` | Unix ms |
| `lastActiveAt` | `number` | Unix ms |

**Indexes:** `by_workos_id`, `by_guest_id`, `by_role`

---

### `user_favorites`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"user_favorites">` | Auto-generated |
| `userId` | `Id<"users">` | Reference to users table |
| `gestureId` | `Id<"gestures">` | Reference to gestures table |
| `createdAt` | `number` | Unix ms when favorited |

**Indexes:** `by_user`, `by_gesture`, `by_user_gesture`  
**Constraint:** Unique on `(userId, gestureId)` enforced at mutation level.

---

### `sponsorships`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"sponsorships">` | Auto-generated |
| `gestureId` | `Id<"gestures">` | Sponsored gesture |
| `sponsorName` | `string` | Name displayed in video overlay |
| `sponsorEmail` | `string` | Sponsor's email for correspondence |
| `overlayImageStorageId` | `string?` | Convex storage ID for logo (deprecated — logo baked into preview) |
| `overlayText` | `string` | Text shown in video overlay |
| `sponsoredVideoPlaybackId` | `string?` | MUX ID for fully composed video (set after approval) |
| `originalVideoPlaybackId` | `string` | MUX ID for the original unsponsored video |
| `previewVideoPlaybackId` | `string?` | MUX ID for the preview video generated during wizard |
| `startDate` | `number` | Unix ms (0 = not yet activated) |
| `endDate` | `number` | Unix ms (calculated at creation) |
| `durationYears` | `number` | Always 1 in current flow |
| `hasLogo` | `boolean?` | Whether the sponsor paid for logo overlay |
| `contactFullName` | `string` | Contact name collected before payment |
| `contactCompany` | `string?` | Optional company name |
| `status` | `string` | See status machine below |
| `molliePaymentId` | `string?` | Mollie payment reference |
| `paymentAmount` | `number` | Amount in euro cents |
| `rejectionReason` | `string?` | Set by admin when rejecting |
| `reviewedBy` | `Id<"users">?` | Admin who reviewed |
| `reviewedAt` | `number?` | Unix ms of review |
| `reEditToken` | `string?` | Signed token for re-edit flow |
| `reEditTokenExpiresAt` | `number?` | Unix ms token expiry |
| `invoiceRequested` | `boolean?` | Whether sponsor requested a VAT invoice |
| `invoiceName` | `string?` | Invoice company/person name |
| `invoiceVatNumber` | `string?` | Belgian VAT/KBO number |
| `invoiceEmail` | `string?` | Email for invoice delivery |
| `renewalReminderSentAt` | `number?` | Unix ms when renewal reminder was sent |
| `createdAt` | `number` | Unix ms |
| `updatedAt` | `number` | Unix ms |

**Indexes:** `by_gesture`, `by_gesture_and_status`, `by_status`, `by_sponsor_email`, `by_mollie_payment_id`

#### Status State Machine

```
pending_payment
    ↓ (Mollie webhook)
pending_approval
    ↓ (admin approves)         ↓ (admin rejects)
  active                     rejected
    ↓ (cron job)
  expired
    
Any state ← pending_resubmission (sponsor re-edits)
Any state → cancelled (admin cancels)
```

---

### `adminLogs`

Audit trail of all admin actions.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"adminLogs">` | Auto-generated |
| `adminId` | `Id<"users">` | Admin who performed the action |
| `action` | `string` | Action type (e.g. `approve_sponsorship`) |
| `targetId` | `string?` | ID of affected document |
| `details` | `object?` | Additional action details |
| `timestamp` | `number` | Unix ms |

---

### `gdprDeletionRequests`

GDPR right-to-be-forgotten requests.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"gdprDeletionRequests">` | Auto-generated |
| `userId` | `string` | WorkOS or guest user ID |
| `email` | `string` | Email used to identify data |
| `requestedAt` | `number` | Unix ms |
| `processedAt` | `number?` | Unix ms when deletion was completed |
| `status` | `"pending" \| "completed"` | Processing status |

---

## SQLite Schema (Native App)

See [SYNC_STRATEGY.md](./SYNC_STRATEGY.md#tables) for the full SQLite table definitions.

### Key Tables

| Table | Purpose | Synced from |
|-------|---------|-------------|
| `gestures` | Local gesture cache | Convex `gestures` |
| `categories` | Local category cache | Convex `categories` |
| `user_favorites` | Local favorites + sync queue | Convex `user_favorites` |
| `favorites_sync_queue` | Offline operation queue | — |
| `sync_metadata` | Last sync time + schema version | — |

### JSON Fields

The native SQLite schema serialises array fields as JSON strings:

```typescript
// Stored in SQLite:  '["Dutch","Flemish","Flemish Sign Language"]'
// Domain type:       string[]
gesture.category = JSON.parse(row.category) as string[];
gesture.concept  = JSON.parse(row.concept)  as string[];
```

This is handled transparently by `operations.ts::mapRowToGesture`.

---

## Schema Migration

### Convex

Convex handles schema changes automatically via the Convex dashboard or `npx convex dev`. Breaking changes require a data migration function.

### SQLite (Native)

Schema changes are versioned via `DATABASE_TARGET_VERSION` in `@smog/config/constants`. When the stored `db_version` is lower than the target:

1. All tables are dropped
2. Fresh tables are created
3. A full sync from Convex repopulates the data

This means **all schema changes are non-incremental** — the full dataset is re-synced. For the current data sizes (~500 gestures) this completes in < 10 seconds.
