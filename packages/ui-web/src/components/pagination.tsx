import { useTranslation } from "@smog/i18n/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, stateLayer, transition } from "../lib/variants";
import { IconButton } from "./icon-button";

type PageItem = number | "…";

/** Page numbers with ellipses: first, last and one either side of the current page. */
export function pageItems(page: number, pageCount: number): PageItem[] {
  const maxPlain = 7;
  if (pageCount <= maxPlain) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) {
    pages.add(2).add(3);
  }
  if (page >= pageCount - 2) {
    pages.add(pageCount - 1).add(pageCount - 2);
  }
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const items: PageItem[] = [];
  for (const [index, p] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && p - previous > 1) {
      items.push("…");
    }
    items.push(p);
  }
  return items;
}

export interface PaginationProps
  extends Omit<ComponentProps<"nav">, "children" | "onChange"> {
  onPageChange: (page: number) => void;
  /** One-based. */
  page: number;
  pageCount: number;
}

/** Web only (admin lists, search results). Mobile lists load more on scroll. */
export function Pagination({
  className,
  onPageChange,
  page,
  pageCount,
  ...props
}: PaginationProps): ReactNode {
  const { t } = useTranslation();
  const items = pageItems(page, pageCount);
  const previous = useCallback(
    () => onPageChange(page - 1),
    [onPageChange, page]
  );
  const next = useCallback(() => onPageChange(page + 1), [onPageChange, page]);
  return (
    <nav
      aria-label={t("a11y.pagination")}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2",
        className
      )}
      {...props}
    >
      <p className="text-body-sm text-foreground-muted">
        {t("kit.pageOf", { page, total: pageCount })}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <IconButton
            disabled={page <= 1}
            icon={<ChevronLeft />}
            label={t("a11y.previousPage")}
            onClick={previous}
          />
        </li>
        {items.map((item, index) =>
          item === "…" ? (
            <li
              aria-label={t("a11y.morePages")}
              className="inline-flex size-touch items-center justify-center text-foreground-muted max-sm:hidden"
              // biome-ignore lint/suspicious/noArrayIndexKey: ellipses have no identity
              key={`gap-${index}`}
            >
              <span aria-hidden="true">…</span>
            </li>
          ) : (
            <li className="max-sm:hidden" key={item}>
              <PageButton
                current={item === page}
                onPageChange={onPageChange}
                page={item}
              />
            </li>
          )
        )}
        <li>
          <IconButton
            disabled={page >= pageCount}
            icon={<ChevronRight />}
            label={t("a11y.nextPage")}
            onClick={next}
          />
        </li>
      </ul>
    </nav>
  );
}

function PageButton({
  current,
  onPageChange,
  page,
}: {
  current: boolean;
  onPageChange: (page: number) => void;
  page: number;
}): ReactNode {
  const { t } = useTranslation();
  const handleClick = useCallback(
    () => onPageChange(page),
    [onPageChange, page]
  );
  return (
    <button
      aria-current={current ? "page" : undefined}
      aria-label={
        current ? t("a11y.currentPage", { page }) : t("a11y.goToPage", { page })
      }
      className={cn(
        "relative inline-flex size-touch items-center justify-center rounded-full font-medium text-body-sm tabular-nums",
        current ? "bg-primary text-primary-foreground" : "text-foreground",
        stateLayer.full,
        focusRing,
        transition,
        disabled
      )}
      onClick={handleClick}
      type="button"
    >
      {page}
    </button>
  );
}
