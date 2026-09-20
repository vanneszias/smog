import { cva } from "class-variance-authority";
import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

/**
 * `caption-bottom` belongs on the table, not the caption: HTML requires
 * `<caption>` to be the table's *first* child — a parser moves it there
 * regardless, and a screen reader reads it as the table's name — while CSS
 * decides where it is drawn.
 */
export const tableVariants = cva("w-full caption-bottom text-md");

export type TableProps = TableHTMLAttributes<HTMLTableElement>;

/**
 * A table and the container that lets it scroll.
 *
 * The wrapper is here rather than left to the caller because a table with
 * more columns than the viewport otherwise pushes the whole page wide, and
 * the page that forgets it is always the one nobody opens on a phone.
 * `className`, the ref and the spread props all go to the `<table>`, so the
 * wrapper never intercepts what a caller aimed at the table.
 */
export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table className={cn(tableVariants(), className)} ref={ref} {...props} />
    </div>
  )
);

Table.displayName = "Table";

export type TableCaptionProps = HTMLAttributes<HTMLTableCaptionElement>;

export const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  TableCaptionProps
>(({ className, ...props }, ref) => (
  <caption
    className={cn("py-2 text-foreground-muted text-sm", className)}
    ref={ref}
    {...props}
  />
));

TableCaption.displayName = "TableCaption";

export type TableHeaderProps = HTMLAttributes<HTMLTableSectionElement>;

/**
 * Border role: functional. The line under the header is where labels stop and
 * data starts, and a reader who loses it loses that — which is the test in
 * `packages/styles/src/tokens.ts` for `border` over `border-subtle`.
 */
export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  TableHeaderProps
>(({ className, ...props }, ref) => (
  <thead
    className={cn("border-border border-b", className)}
    ref={ref}
    {...props}
  />
));

TableHeader.displayName = "TableHeader";

export type TableBodyProps = HTMLAttributes<HTMLTableSectionElement>;

export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, ...props }, ref) => (
    <tbody className={cn("align-middle", className)} ref={ref} {...props} />
  )
);

TableBody.displayName = "TableBody";

export type TableFooterProps = HTMLAttributes<HTMLTableSectionElement>;

export const TableFooter = forwardRef<
  HTMLTableSectionElement,
  TableFooterProps
>(({ className, ...props }, ref) => (
  <tfoot
    className={cn("border-border border-t font-medium", className)}
    ref={ref}
    {...props}
  />
));

TableFooter.displayName = "TableFooter";

export type TableRowProps = HTMLAttributes<HTMLTableRowElement>;

/**
 * Border role: decorative. A rule between two data rows loses nothing when it
 * goes — the rows are still rows — so it is `border-subtle`. `last:border-b-0`
 * keeps a header row's own rule out of the way of the `<thead>` boundary.
 */
export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, ...props }, ref) => (
    <tr
      className={cn(
        "border-border-subtle border-b transition-colors last:border-b-0 hover:bg-surface",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

TableRow.displayName = "TableRow";

export type TableHeadProps = ThHTMLAttributes<HTMLTableCellElement>;

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, scope = "col", ...props }, ref) => (
    <th
      className={cn(
        "h-10 px-3 text-left align-middle font-medium text-foreground-muted text-sm",
        className
      )}
      ref={ref}
      scope={scope}
      {...props}
    />
  )
);

TableHead.displayName = "TableHead";

export type TableCellProps = TdHTMLAttributes<HTMLTableCellElement>;

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => (
    <td
      className={cn("px-3 py-2 align-middle", className)}
      ref={ref}
      {...props}
    />
  )
);

TableCell.displayName = "TableCell";
