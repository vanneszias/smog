"use client";

/* A client component: every category button takes an `onClick` closing over `onChange`.
 * Why this is per file and not on the barrel: see `src/index.ts`. */

import { forwardRef, type HTMLAttributes } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { cn } from "../lib/cn";

export interface CategoryOption {
  id: string;
  name: string;
}

export type CategoryFilterProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "children"
> & {
  categories: readonly CategoryOption[];
  /** The ids currently selected. The component holds no state of its own. */
  selectedIds?: readonly string[];
  /** Called with the **whole** next selection, never with the id pressed. */
  onChange: (selectedIds: string[]) => void;
  label?: string;
  formatCount?: (count: number) => string;
};

/**
 * Toggle one filter per category.
 *
 * `onChange` receives the entire next selection rather than the id that was
 * pressed. A caller that has to work out the difference itself will get it
 * right in one of its call sites and wrong in the other, and the wrong one is
 * always the one with the "clear all" button next to it.
 *
 * Two properties of that next selection are pinned by name in the tests:
 *
 * - the array it was **given** is never touched, so a caller holding the
 *   previous selection in state still holds the previous selection;
 * - ids the component has no category for are **kept**. A filter rendered
 *   from a page of categories must not silently drop the selection made on
 *   the page before it.
 *
 * The toggles are `aria-pressed` buttons rather than checkboxes because that
 * is what they look like and what they do: nothing here is submitted.
 */
export const CategoryFilter = forwardRef<HTMLDivElement, CategoryFilterProps>(
  (
    {
      className,
      categories,
      selectedIds,
      onChange,
      label = "Categorieën",
      formatCount = (count) => `${count} geselecteerd`,
      ...props
    },
    ref
  ) => {
    const selected = selectedIds ?? [];
    const selectedSet = new Set(selected);
    const known = new Set(categories.map((category) => category.id));
    const unknown = selected.filter((id) => !known.has(id));

    const toggle = (id: string) => {
      const next = new Set(selectedSet);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onChange([
        ...unknown,
        ...categories
          .filter((category) => next.has(category.id))
          .map((category) => category.id),
      ]);
    };

    return (
      // biome-ignore lint/a11y/useSemanticElements: a <fieldset> groups the controls of a form and needs a <legend> to be named; these are toggle buttons that submit nothing and are named by aria-label. role="group" on a div is the grouping this needs, and the element the suggestion asks for would make it a form it is not.
      <div
        aria-label={label}
        className={cn("flex flex-wrap items-center gap-2", className)}
        ref={ref}
        role="group"
        {...props}
      >
        {categories.map((category) => {
          const isSelected = selectedSet.has(category.id);

          return (
            <Button
              aria-pressed={isSelected}
              key={category.id}
              onClick={() => toggle(category.id)}
              size="sm"
              type="button"
              variant={isSelected ? "primary" : "outline"}
            >
              {category.name}
            </Button>
          );
        })}
        {selected.length === 0 ? null : (
          <Badge size="sm" variant="primary">
            {formatCount(selected.length)}
          </Badge>
        )}
      </div>
    );
  }
);

CategoryFilter.displayName = "CategoryFilter";
