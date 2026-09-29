import { useTranslation } from "@smog/i18n/react";
import { type ReactElement, useCallback } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { Chip } from "../components/chip";
import type { CategoryRef } from "./types";

export interface CategoryChipsProps
  extends Omit<ScrollViewProps, "children" | "horizontal"> {
  /** Names the row (`search.categories` by default). */
  "aria-label"?: string;
  categories: readonly CategoryRef[];
  className?: string;
  /** Called with the next selected slugs, in category order. */
  onChange: (selected: string[]) => void;
  /** The selected slugs (empty: all categories). */
  selected: readonly string[];
  /** Leads with an `All` chip (`search.allCategories`) that clears the selection. */
  showAll?: boolean;
}

/**
 * The category filter: a horizontal row of toggle chips. The row is named
 * but is not an accessibility element itself, so each chip stays focusable.
 */
export function CategoryChips({
  "aria-label": ariaLabel,
  categories,
  className,
  onChange,
  selected,
  showAll = true,
  ...props
}: CategoryChipsProps): ReactElement {
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
    <ScrollView
      accessibilityLabel={ariaLabel ?? t("search.categories")}
      className={className}
      contentContainerClassName="flex-row gap-3 px-4 py-1"
      horizontal
      showsHorizontalScrollIndicator={false}
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
    </ScrollView>
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
}): ReactElement {
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
