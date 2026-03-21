/**
 * @fileoverview Native SQLite database row types
 *
 * These interfaces mirror the raw SQLite column shapes used by `databaseService`.
 * They intentionally differ from the domain types (Gesture, Category) because:
 * - Arrays are stored as JSON strings in SQLite
 * - Boolean values are stored as INTEGER (0/1)
 * - All dates are stored as ISO strings
 */

/**
 * Raw SQLite row shape for the `gestures` table.
 */
export interface DatabaseGesture {
  id: string;
  name: string;
  /** JSON-encoded string array of category names */
  category: string;
  playbackId: string;
  /** JSON-encoded string array of related concepts */
  concept: string;
  info: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  /** Convex document ID, used to correlate with the remote database */
  convexId?: string;
}

/**
 * Raw SQLite row shape for the `categories` table.
 */
export interface DatabaseCategory {
  id: string;
  name: string;
  description?: string;
  /** Stored as INTEGER: 0 = inactive, 1 = active */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  /** Convex document ID */
  convexId?: string;
}

/**
 * Raw SQLite row shape for the `sync_metadata` table.
 */
export interface SyncMetadata {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Result from `databaseService.getDatabaseStats()`.
 */
export interface DatabaseStats {
  gestureCount: number;
  lastSync: Date | null;
  databaseSize: string;
}

/**
 * Shape of a `PRAGMA table_info(...)` result row.
 */
export interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | number | null;
  pk: number;
}
