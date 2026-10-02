import { useTranslation } from "@smog/i18n/react";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { Chip } from "../components/chip";
import { cn } from "../lib/cn";
import type { CategoryRef } from "./types";

export interface CategoryChipsProps
  extends Omit<ComponentProps<"fieldset">, "onChange"> {
  categories: readonly CategoryRef[];
  /** Called with the next selected slugs, in category order. */
  onChange: (selected: string[]) => void;
  /** The selected slugs (empty: all categories). */
  selected: readonly string[];
  /** Leads with an `All` chip (`search.allCategories`) that clears the selection. */
  showAll?: boolean;
}

/**
 * The category filter: a labelled group (`search.categories`) of toggle
 * chips that scrolls sideways on narrow screens and wraps from `md`.
 */
export function CategoryChips({
  "aria-label": ariaLabel,
  categories,
  className,
  onChange,
  selected,
  showAll = true,
  ...props
}: CategoryChipsProps): ReactNode {
  const { t } = useTranslation();
  const toggle = useCallback(
    (slug: string, on: boolean): void => {
      const next = new Set(selected);
      if (on) {
        next.add(slug);
      } else {
        next.delete(slug);
      }
      onChange(
        categories
          .map((category) => category.slug)
          .filter((item) => next.has(item))
      );
    },
    [categories, onChange, selected]
  );
  const clear = useCallback((): void => {
    onChange([]);
  }, [onChange]);
  return (
    <fieldset
      aria-label={ariaLabel ?? t("search.categories")}
      className={cn(
        // Vertical padding keeps the chips' focus rings inside the scroller.
        "m-0 -mx-4 flex min-w-0 gap-2 overflow-x-auto border-0 px-4 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0",
        className
      )}
      {...props}
    >
      {showAll ? (
        <Chip onSelectedChange={clear} selected={selected.length === 0}>
          {t("search.allCategories")}
        </Chip>
      ) : null}
      {categories.map((category) => (
        <CategoryChip
          key={category.slug}
          name={category.name}
          onToggle={toggle}
          selected={selected.includes(category.slug)}
          slug={category.slug}
        />
      ))}
    </fieldset>
  );
}

function CategoryChip({
  name,
  onToggle,
  selected,
  slug,
}: {
  name: string;
  onToggle: (slug: string, on: boolean) => void;
  selected: boolean;
  slug: string;
}): ReactNode {
  const change = useCallback(
    (on: boolean): void => {
      onToggle(slug, on);
    },
    [onToggle, slug]
  );
  return (
    <Chip onSelectedChange={change} selected={selected}>
      {name}
    </Chip>
  );
}
