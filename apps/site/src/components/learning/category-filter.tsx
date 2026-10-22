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
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export interface CategoryFilterProps {
  categories: readonly CategoryRef[];
  onChange: (selected: string[]) => void;
  selected: readonly string[];
}

/**
 * The browse page's category filter (phase 10a). From `md` the chips sit
 * under the search field; on a phone the same filter lives in a bottom
 * sheet behind a "Filters" button (with the number chosen), so the results
 * keep the screen. The chips apply as they are picked, "Show results" just
 * closes the sheet.
 */
export function CategoryFilterTrigger({
  categories,
  onChange,
  selected,
}: CategoryFilterProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Sheet>
      <SheetTrigger asChild>
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
      </SheetTrigger>
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

/** The inline chips from `md` (hidden on a phone, where the sheet filters). */
export function CategoryFilterInline({
  categories,
  onChange,
  selected,
}: CategoryFilterProps): ReactNode {
  return (
    <CategoryChips
      categories={categories}
      className="hidden md:flex"
      onChange={onChange}
      selected={selected}
    />
  );
}
