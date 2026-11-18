import type { Category } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  CategoryChips,
  type CategoryRef,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetTrigger,
} from "@smog/ui-web";
import { LayoutList, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useCatalogDisplay } from "./catalog-display";

export interface CategoryFilterProps {
  categories: readonly Pick<Category, "fallbackUsed" | "name" | "slug">[];
  onChange: (selected: string[]) => void;
  selected: readonly string[];
}

/** The categories as the chips show them: sentence case, `lang` if untranslated. */
function useChipCategories(
  categories: CategoryFilterProps["categories"]
): CategoryRef[] {
  const display = useCatalogDisplay();
  return useMemo(
    () =>
      categories.map((category) => {
        const shown = display.category(category);
        return { lang: shown.lang, name: shown.name, slug: shown.slug };
      }),
    [categories, display]
  );
}

/** Every category in a bottom sheet; the chips apply as they are picked. */
function FilterSheet({
  categories,
  children,
  onChange,
  selected,
}: {
  categories: readonly CategoryRef[];
  children: ReactNode;
  onChange: (selected: string[]) => void;
  selected: readonly string[];
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        description={t("browse.sheetDescription")}
        side="bottom"
        title={t("search.filter")}
      >
        <CategoryChips
          categories={categories}
          className="mx-0 flex-wrap overflow-visible px-0"
          onChange={onChange}
          selected={selected}
          tone="action"
        />
        <SheetFooter>
          <SheetClose asChild>
            <Button>{t("search.showResults")}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The browse page's category filter on a phone: a "Filters" button (with
 * the number chosen) beside the field opens every category in a bottom
 * sheet, so the results keep the screen. "Show results" just closes it.
 */
export function CategoryFilterTrigger({
  categories,
  onChange,
  selected,
}: CategoryFilterProps): ReactNode {
  const { t } = useTranslation();
  const chips = useChipCategories(categories);
  return (
    <FilterSheet categories={chips} onChange={onChange} selected={selected}>
      <Button
        className="shrink-0 md:hidden"
        icon={<SlidersHorizontal />}
        size="lg"
        variant="secondary"
      >
        {t("browse.filters")}
        {selected.length > 0 ? (
          <Badge variant="primary">
            {t("browse.selected", { count: selected.length })}
          </Badge>
        ) : null}
      </Button>
    </FilterSheet>
  );
}

/**
 * From `md`: one row of chips that scrolls sideways (never a wall of
 * wrapped chips above the results), the active filter in the orange
 * "do it" tone, and an "All themes" button at its end that opens the
 * same sheet as on a phone.
 */
export function CategoryFilterInline({
  categories,
  onChange,
  selected,
}: CategoryFilterProps): ReactNode {
  const { t } = useTranslation();
  const chips = useChipCategories(categories);
  return (
    <div className="hidden min-w-0 items-center gap-2 md:flex">
      <CategoryChips
        categories={chips}
        className="min-w-0 flex-1 md:flex-nowrap md:overflow-x-auto"
        onChange={onChange}
        selected={selected}
        tone="action"
      />
      <FilterSheet categories={chips} onChange={onChange} selected={selected}>
        <Button className="shrink-0" icon={<LayoutList />} variant="ghost">
          {t("gestures.allThemes")}
        </Button>
      </FilterSheet>
    </div>
  );
}
