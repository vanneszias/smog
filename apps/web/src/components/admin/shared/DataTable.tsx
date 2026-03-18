/**
 * @fileoverview Generic, reusable data table component for admin views.
 *
 * Renders any tabular data given a column definition and a data array.
 * Supports loading and error states, optional row-click, edit, and delete
 * callbacks.
 *
 * Used by both `SponsorshipsManagement` and `AdminTable` to eliminate
 * duplicated table rendering logic.
 *
 * @example
 * <DataTable
 *   columns={sponsorshipColumns}
 *   data={sponsorships}
 *   onEdit={(row) => openEditDialog(row)}
 *   isLoading={isLoading}
 * />
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smog/ui";
import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Column definition for the `DataTable` component.
 *
 * @typeParam TData - The row data type.
 */
export interface DataTableColumn<TData> {
  /** Unique column key matching a field on `TData`. */
  key: string;
  /** Column header label. */
  header: string;
  /** Optional custom cell renderer. Receives the raw value and the full row. */
  // biome-ignore lint/suspicious/noExplicitAny: Generic render function accepts any column value
  render?: (value: any, row: TData) => ReactNode;
  /** Whether the column content should be truncated with ellipsis. */
  truncate?: boolean;
  /** Optional CSS class to apply to the `<td>` element. */
  className?: string;
}

/**
 * Props for the `DataTable` component.
 *
 * @typeParam TData - The row data type. Must have a string `_id` field or
 *   a unique property that can be used as a React key.
 */
export interface DataTableProps<TData extends { _id?: string }> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  /** Called when a row is clicked. */
  onRowClick?: (row: TData) => void;
  /** Called when the edit action is triggered. */
  onEdit?: (row: TData) => void;
  /** Called when the delete action is triggered. */
  onDelete?: (row: TData) => void;
  /** Show a loading skeleton instead of data. */
  isLoading?: boolean;
  /** Show an error message instead of data. */
  error?: Error | null;
  /** Key function for rows. Defaults to `(row) => row._id ?? JSON.stringify(row)`. */
  getRowKey?: (row: TData) => string;
  /** Optional CSS class for the table wrapper. */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Generic sortable data table for admin views.
 *
 * @typeParam TData - The row data type.
 */
export function DataTable<TData extends { _id?: string }>({
  columns,
  data,
  onRowClick,
  isLoading,
  error,
  getRowKey,
  className,
}: DataTableProps<TData>) {
  const defaultGetRowKey = (row: TData): string =>
    row._id ?? JSON.stringify(row);

  const rowKey = getRowKey ?? defaultGetRowKey;

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
        Laden…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center text-destructive text-sm">
        {error.message || "Er is een fout opgetreden."}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
        Geen resultaten gevonden.
      </div>
    );
  }

  return (
    <div
      className={`overflow-auto rounded-lg border border-border ${className ?? ""}`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              className={
                onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined
              }
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => {
                // biome-ignore lint/suspicious/noExplicitAny: Dynamic row access by key
                const value = (row as any)[col.key];
                return (
                  <TableCell
                    className={`${col.truncate ? "max-w-[200px] truncate" : ""} ${col.className ?? ""}`}
                    key={col.key}
                  >
                    {col.render ? col.render(value, row) : String(value ?? "")}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
