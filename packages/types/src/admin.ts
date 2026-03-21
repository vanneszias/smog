/**
 * @fileoverview Admin panel types
 *
 * Types used by the admin dashboard for table configuration,
 * filtering, sorting, and gesture/sponsorship management.
 *
 * Note: The `render` function for table columns is not included here to keep
 * `@smog/types` free of React dependencies. See the `DataTable` component in
 * `apps/web/src/components/admin/shared/DataTable.tsx` for the React-specific
 * column definition that includes a `render` prop.
 */

import type { Gesture } from "./gestures";
import type { SponsorshipStatus, SponsorshipWithGesture } from "./sponsorships";

// ===== TABLE TYPES =====

/**
 * A base column definition for a data table (without React-specific render fn).
 */
export interface DataTableColumnBase<TData> {
  /** Property key from the row data type */
  key: keyof TData;
  /** Column header label */
  header: string;
  sortable?: boolean;
  filterable?: boolean;
}

/**
 * Base props for the generic DataTable component.
 */
export interface DataTableBaseProps<TData> {
  data: TData[];
  onRowClick?: (row: TData) => void;
  onEdit?: (row: TData) => void;
  onDelete?: (row: TData) => void;
  isLoading?: boolean;
  error?: Error | null;
}

// ===== FILTER TYPES =====

/**
 * A single admin filter entry.
 */
export interface AdminFilter {
  field: string;
  value: string | string[] | boolean | null;
}

// ===== ADMIN-SPECIFIC GESTURE ROW =====

/**
 * A gesture row as shown in the admin gestures table.
 * Extends the base Gesture with admin-only fields.
 */
export interface AdminGestureRow extends Gesture {
  isActive: boolean;
  categoryIds: string[];
}

// ===== ADMIN-SPECIFIC SPONSORSHIP ROW =====

/**
 * A sponsorship row as shown in the admin sponsorships table.
 */
export type AdminSponsorshipRow = SponsorshipWithGesture;

// ===== STATUS FILTER =====

/**
 * Values available in the sponsorship status filter dropdown.
 * Includes "all" as a special catch-all option.
 */
export type SponsorshipStatusFilter = SponsorshipStatus | "all";
