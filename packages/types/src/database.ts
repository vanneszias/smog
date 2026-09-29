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
  /** JSON-encoded string array of category names */
  category: string;
  /** JSON-encoded string array of related concepts */
  concept: string;
  /** Convex document ID, used to correlate with the remote database */
  convexId?: string;
  createdAt: string;
  id: string;
  info: string;
  lastSyncAt?: string;
  name: string;
  playbackId: string;
  updatedAt: string;
}

/**
 * Raw SQLite row shape for the `categories` table.
 */
export interface DatabaseCategory {
  /** Convex document ID */
  convexId?: string;
  createdAt: string;
  description?: string;
  id: string;
  /** Stored as INTEGER: 0 = inactive, 1 = active */
  isActive: boolean;
  lastSyncAt?: string;
  name: string;
  updatedAt: string;
}

/**
 * Raw SQLite row shape for the `sync_metadata` table.
 */
export interface SyncMetadata {
  key: string;
  updatedAt: string;
  value: string;
}

/**
 * Result from `databaseService.getDatabaseStats()`.
 */
export interface DatabaseStats {
  databaseSize: string;
  gestureCount: number;
  lastSync: Date | null;
}

/**
 * Shape of a `PRAGMA table_info(...)` result row.
 */
export interface TableColumnInfo {
  cid: number;
  dflt_value: string | number | null;
  name: string;
  notnull: number;
  pk: number;
  type: string;
}
