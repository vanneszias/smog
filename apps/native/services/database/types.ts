/**
 * @fileoverview TypeScript types for the SQLite database layer.
 *
 * Defines the internal row shapes used when reading from / writing to the
 * local SQLite database. These types are intentionally separate from the
 * domain types in `@smog/types` because the database stores JSON-serialised
 * arrays as text strings, whereas domain types use proper arrays.
 */

/** Raw row shape as stored in the `gestures` SQLite table. */
export interface DatabaseGesture {
  id: string;
  name: string;
  /** JSON-serialised `string[]` (e.g. `'["Category A","Category B"]'`). */
  category: string;
  playbackId: string;
  /** JSON-serialised `string[]`. */
  concept: string;
  info: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  /** Convex document ID for sync tracking. */
  convexId?: string;
}

/** Raw row shape as stored in the `categories` SQLite table. */
export interface DatabaseCategory {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  /** Convex document ID for sync tracking. */
  convexId?: string;
}

/** Row shape for the `sync_metadata` key-value table. */
export interface SyncMetadataRow {
  key: string;
  value: string;
  updatedAt: string;
}

/** Column info row returned by `PRAGMA table_info(...)`. */
export interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | number | null;
  pk: number;
}
