"use client";

/* A client component: its two buttons take an `onClick` closing over `onPageChange`, and an event handler cannot cross the server/client boundary.
 * Why this is per file and not on the barrel: see `src/index.ts`. */

import { cva } from "class-variance-authority";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { Button } from "./Button";

export const paginationVariants = cva(
  "flex w-full items-center justify-between gap-4"
);

export type PaginationProps = Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "onChange"
> & {
  /** The current page, counting from one. */
  page: number;
  /** How many pages there are in total. */
  pageCount: number;
  /** Called with the page to move to. Never called for a disabled direction. */
  onPageChange?: (page: number) => void;
  /** The landmark's accessible name. */
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  /** Formats the "where am I" line, for a caller translating the interface. */
  formatStatus?: (page: number, pageCount: number) => string;
};

/**
 * Previous, next, and where the reader is.
 *
 * The two ends are the whole contract: previous is disabled on page one and
 * next on the last page, so no click can produce a page index that does not
 * exist. `disabled` is set on the buttons rather than the handler being
 * guarded, because a control that looks pressable and does nothing is a worse
 * answer than one that says it cannot be pressed.
 *
 * It is a `<nav>` with a name, so a screen reader can jump to it and so two
 * paginated lists on one page are told apart. Every string is a prop with a
 * Dutch default; nothing here reaches for a translation library, because a
 * component in this package takes props and renders.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    {
      className,
      page,
      pageCount,
      onPageChange,
      label = "Paginering",
      previousLabel = "Vorige",
      nextLabel = "Volgende",
      formatStatus = (current, total) => `Pagina ${current} van ${total}`,
      ...props
    },
    ref
  ) => {
    const hasPrevious = page > 1;
    const hasNext = page < pageCount;

    return (
      <nav
        aria-label={label}
        className={cn(paginationVariants(), className)}
        ref={ref}
        {...props}
      >
        <Button
          disabled={!hasPrevious}
          onClick={() => onPageChange?.(page - 1)}
          size="sm"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {previousLabel}
        </Button>
        <p aria-live="polite" className="text-foreground-muted text-sm">
          {formatStatus(page, pageCount)}
        </p>
        <Button
          disabled={!hasNext}
          onClick={() => onPageChange?.(page + 1)}
          size="sm"
          variant="outline"
        >
          {nextLabel}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </nav>
    );
  }
);

Pagination.displayName = "Pagination";
