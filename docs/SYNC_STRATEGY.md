# Sync Strategy

> Last updated: March 18, 2026  
> See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_FLOW.md](./DATA_FLOW.md)

## Overview

The SMOG native app uses an **offline-first** architecture where gesture and category data is stored locally in SQLite and synced from Convex in the background.

```
User opens app
    ↓
Read from local SQLite (instant, works offline)
    ↓
convexSyncService polls Convex every 2 hours
    ↓
Writes new/updated records to SQLite
    ↓
gestureService reads updated data on next request
```

---

## Data Flow

```
Convex (source of truth)
    ↑ sync (background, every 2 hours)
SQLite on device (local cache)
    ↑ read
gestureService.ts
    ↑ call
React components
```

---

## Sync Service (`convexSyncService.ts`)

### Responsibilities

1. **Initialization** — On first launch, performs an initial full sync from Convex
2. **Background polling** — Syncs every `SYNC_INTERVAL_MS` (2 hours) while the app is open
3. **Retry logic** — On failure, retries up to `MAX_SYNC_RETRIES` (3) times with `SYNC_RETRY_DELAY_MS` (5 min) delay
4. **Network awareness** — Only syncs when network is available (via `NetworkService`)

### Configuration (from `@smog/config/constants`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `SYNC_INTERVAL_MS` | 2 hours | How often to poll Convex |
| `SYNC_RETRY_DELAY_MS` | 5 minutes | Delay before retry on failure |
| `MAX_SYNC_RETRIES` | 3 | Max consecutive failures before giving up |

### Status States

```typescript
type SyncStatus = {
  isSyncing: boolean;
  lastSync: Date | null;
  lastAttempt: Date | null;
  nextSync: Date | null;
};
```

---

## Database Service (`services/database/`)

The database service is decomposed into four modules:

| Module | Responsibility |
|--------|---------------|
| `types.ts` | SQLite row shapes (`DatabaseGesture`, `DatabaseCategory`) |
| `schema.ts` | Table creation and versioned migrations |
| `operations.ts` | CRUD and query functions |
| `index.ts` | `DatabaseService` singleton (public API) |

### Schema Versioning

The schema version is tracked in the `sync_metadata` table under `key = 'db_version'`. The current target version is `DATABASE_TARGET_VERSION` from `@smog/config/constants`.

When the stored version is lower than the target:
1. All existing tables are dropped
2. Fresh tables are created with the new schema
3. Sync is triggered to repopulate from Convex

### Tables

```sql
-- Gesture data
CREATE TABLE gestures (
  id TEXT PRIMARY KEY,
  convexId TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,     -- JSON array: '["Dutch","Flemish"]'
  playbackId TEXT NOT NULL,   -- MUX playback ID
  concept TEXT NOT NULL,      -- JSON array: '["hello","greeting"]'
  info TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  lastSyncAt TEXT
);

-- Category metadata
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  convexId TEXT UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  lastSyncAt TEXT
);

-- Favorites (with offline queue)
CREATE TABLE user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  gesture_id TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  operation_id TEXT NOT NULL,
  UNIQUE(user_id, gesture_id)
);

CREATE TABLE favorites_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  gesture_id TEXT NOT NULL,
  operation TEXT NOT NULL,  -- 'add' | 'remove'
  created_at TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TEXT,
  error_message TEXT
);

-- Sync metadata (key-value store)
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

---

## Conflict Resolution

The current strategy is **last-write-wins**: when Convex has newer data than the local SQLite row (compared by `updatedAt`), the local row is replaced.

For favorites, the sync queue ensures pending operations are replayed on reconnect. If a conflict arises (e.g., local add + remote remove), the remote state wins after the next sync.

---

## Offline Favorites

Favorites use optimistic updates:

1. User taps favorite → SQLite is updated immediately (status: `pending`)
2. Operation is queued in `favorites_sync_queue`
3. On next sync, queued operations are sent to Convex
4. On success, status changes to `synced`
5. On failure, `retry_count` increments (max 3 retries)

---

## Debugging Sync

To inspect the current sync state:

```bash
# Check last sync time
# (from Developer Tools screen in the app)
# Or query SQLite directly:
SELECT * FROM sync_metadata;
```

Key metadata keys:
- `db_version` — current schema version
- `last_sync` — ISO timestamp of last successful sync
