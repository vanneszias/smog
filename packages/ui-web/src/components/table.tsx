import { useTranslation } from "@smog/i18n/react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { cn } from "../lib/cn";
import { focusRing, transition } from "../lib/variants";

/* Table is web only (admin). Dense rows are allowed here (spec §16). */

export interface TableProps extends ComponentProps<"table"> {
  /** Classes for the scroll container (e.g. a max height for a sticky header). */
  containerClassName?: string;
}

export function Table({
  className,
  containerClassName,
  ...props
}: TableProps): ReactNode {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-lg border border-border-subtle bg-surface",
        containerClassName
      )}
    >
      <table
        className={cn(
          "w-full caption-bottom border-collapse text-body-sm",
          className
        )}
        {...props}
      />
    </div>
  );
}

export interface TableHeaderProps extends ComponentProps<"thead"> {
  /** Keep the header visible while the table scrolls. */
  sticky?: boolean;
}

export function TableHeader({
  className,
  sticky = false,
  ...props
}: TableHeaderProps): ReactNode {
  return (
    <thead
      className={cn(
        "bg-surface-sunken",
        sticky && "sticky top-0 z-10",
        className
      )}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: ComponentProps<"tbody">): ReactNode {
  return <tbody className={cn("*:last:border-b-0", className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: ComponentProps<"tr">): ReactNode {
  return (
    <tr
      className={cn(
        "border-border-subtle border-b data-[state=selected]:bg-primary-subtle",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: ComponentProps<"th">): ReactNode {
  return (
    <th
      className={cn(
        "h-touch whitespace-nowrap px-3 text-left align-middle font-semibold text-caption text-foreground-muted",
        className
      )}
      scope="col"
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: ComponentProps<"td">): ReactNode {
  return (
    <td
      className={cn("px-3 py-2 align-middle text-foreground", className)}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: ComponentProps<"caption">): ReactNode {
  return (
    <caption
      className={cn("px-3 py-2 text-caption text-foreground-muted", className)}
      {...props}
    />
  );
}

type SortDirection = "asc" | "desc";

export interface SortState {
  direction: SortDirection;
  id: string;
}

export interface DataTableColumn<Row> {
  align?: "start" | "end";
  cell: (row: Row) => ReactNode;
  header: ReactNode;
  id: string;
  /** Makes the column sortable. */
  sortValue?: (row: Row) => string | number;
}

export interface DataTableProps<Row>
  extends Omit<ComponentProps<"table">, "children"> {
  columns: readonly DataTableColumn<Row>[];
  defaultSort?: SortState | null;
  /** Shown in one full-width cell when there are no rows. */
  empty?: ReactNode;
  getRowId: (row: Row) => string;
  /** Makes rows clickable (mouse, Enter and Space). */
  onRowClick?: (row: Row) => void;
  onSortChange?: (sort: SortState | null) => void;
  rows: readonly Row[];
  /** Controlled sort (for URL-synced admin filters). */
  sort?: SortState | null;
  stickyHeader?: boolean;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return collator.compare(String(a), String(b));
}

/** none → ascending → descending → none. */
function nextSort(sort: SortState | null, id: string): SortState | null {
  if (sort?.id !== id) {
    return { direction: "asc", id };
  }
  return sort.direction === "asc" ? { direction: "desc", id } : null;
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/** A sortable table with a sticky header and clickable rows (admin lists). */
export function DataTable<Row>({
  columns,
  defaultSort = null,
  empty,
  getRowId,
  onRowClick,
  onSortChange,
  rows,
  sort: controlledSort,
  stickyHeader = false,
  ...props
}: DataTableProps<Row>): ReactNode {
  const [uncontrolledSort, setUncontrolledSort] = useState(defaultSort);
  const sort = controlledSort === undefined ? uncontrolledSort : controlledSort;

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === sort?.id);
    if (!(sort && column?.sortValue)) {
      return rows;
    }
    const value = column.sortValue;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(value(a), value(b)));
  }, [columns, rows, sort]);

  const toggle = useCallback(
    (id: string): void => {
      const next = nextSort(sort, id);
      if (controlledSort === undefined) {
        setUncontrolledSort(next);
      }
      onSortChange?.(next);
    },
    [controlledSort, onSortChange, sort]
  );

  return (
    <Table {...props}>
      <TableHeader sticky={stickyHeader}>
        <TableRow>
          {columns.map((column) => (
            <SortableHead
              active={sort?.id === column.id ? sort.direction : null}
              column={column}
              key={column.id}
              onToggle={toggle}
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && empty ? (
          <TableRow>
            <TableCell
              className="py-6 text-center text-foreground-muted"
              colSpan={columns.length}
            >
              {empty}
            </TableCell>
          </TableRow>
        ) : null}
        {sorted.map((row) => (
          <DataRow
            columns={columns}
            key={getRowId(row)}
            onRowClick={onRowClick}
            row={row}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function SortableHead<Row>({
  active,
  column,
  onToggle,
}: {
  active: SortDirection | null;
  column: DataTableColumn<Row>;
  onToggle: (id: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const end = column.align === "end";
  const handleClick = useCallback(
    () => onToggle(column.id),
    [column.id, onToggle]
  );
  if (!column.sortValue) {
    return (
      <TableHead className={cn(end && "text-right")}>{column.header}</TableHead>
    );
  }
  let Icon = ArrowUpDown;
  if (active === "asc") {
    Icon = ArrowUp;
  } else if (active === "desc") {
    Icon = ArrowDown;
  }
  return (
    <TableHead
      aria-sort={active ? ARIA_SORT[active] : "none"}
      className={cn("px-1", end && "text-right")}
    >
      <button
        className={cn(
          "inline-flex min-h-touch items-center gap-1 rounded-sm px-2 font-semibold hover:text-foreground",
          end && "flex-row-reverse",
          active && "text-foreground",
          focusRing,
          transition
        )}
        onClick={handleClick}
        title={t(
          active === "asc" ? "a11y.sortDescending" : "a11y.sortAscending"
        )}
        type="button"
      >
        {column.header}
        <Icon aria-hidden="true" className="size-4 shrink-0" />
      </button>
    </TableHead>
  );
}

function DataRow<Row>({
  columns,
  onRowClick,
  row,
}: {
  columns: readonly DataTableColumn<Row>[];
  onRowClick: ((row: Row) => void) | undefined;
  row: Row;
}): ReactNode {
  const cells = columns.map((column) => (
    <TableCell
      className={cn(column.align === "end" && "text-right tabular-nums")}
      key={column.id}
    >
      {column.cell(row)}
    </TableCell>
  ));
  const handleClick = useCallback(() => onRowClick?.(row), [onRowClick, row]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onRowClick?.(row);
      }
    },
    [onRowClick, row]
  );
  if (!onRowClick) {
    return <TableRow>{cells}</TableRow>;
  }
  // A row is not a button (it holds cells), so it takes focus and keys itself;
  // the cells stay readable as a table.
  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-surface-sunken",
        focusRing,
        "focus-visible:ring-inset"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {cells}
    </TableRow>
  );
}
