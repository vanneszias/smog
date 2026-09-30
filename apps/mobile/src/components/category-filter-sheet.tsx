import type { Category } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  Checkbox,
  IconButton,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetTrigger,
} from "@smog/ui-native";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { type ReactElement, useCallback } from "react";
import { ScrollView, View } from "react-native";
import { useSheetScrollStyle } from "@/lib/sheet";

export interface CategoryFilterSheetProps {
  categories: readonly Category[];
  onChange: (selected: string[]) => void;
  /** Selected slugs, in category order. */
  selected: readonly string[];
}

function CategoryOption({
  checked,
  name,
  onToggle,
  slug,
}: {
  checked: boolean;
  name: string;
  onToggle: (slug: string, on: boolean) => void;
  slug: string;
}): ReactElement {
  const change = useCallback(
    (on: boolean) => onToggle(slug, on),
    [onToggle, slug]
  );
  return <Checkbox checked={checked} label={name} onCheckedChange={change} />;
}

/**
 * The search tab's category filter (spec §16): a button with the number
 * chosen, opening a sheet with a checkbox per category (OR semantics).
 */
export function CategoryFilterSheet({
  categories,
  onChange,
  selected,
}: CategoryFilterSheetProps): ReactElement {
  const { t } = useTranslation();
  const toggle = useCallback(
    (slug: string, on: boolean) => {
      const next = new Set(selected);
      if (on) {
        next.add(slug);
      } else {
        next.delete(slug);
      }
      // analytics: search_performed { source: "filter_change" } (sent by the search hook)
      onChange(
        categories.map((item) => item.slug).filter((item) => next.has(item))
      );
    },
    [categories, onChange, selected]
  );
  const clear = useCallback(() => onChange([]), [onChange]);
  const count = selected.length;
  const scrollStyle = useSheetScrollStyle();
  return (
    <Sheet>
      <View className="relative">
        <SheetTrigger>
          <IconButton
            icon={<SlidersHorizontal />}
            label={
              count > 0
                ? t("search.filterActive", { count })
                : t("search.filter")
            }
            testID="category-filter"
            variant={count > 0 ? "secondary" : "ghost"}
          />
        </SheetTrigger>
        {count > 0 ? (
          <Badge
            accessibilityElementsHidden
            className="absolute -top-1 -right-1"
            importantForAccessibility="no-hide-descendants"
            variant="primary"
          >
            {String(count)}
          </Badge>
        ) : null}
      </View>
      <SheetContent title={t("search.filter")}>
        <ScrollView style={scrollStyle}>
          {categories.map((category) => (
            <CategoryOption
              checked={selected.includes(category.slug)}
              key={category.slug}
              name={category.name}
              onToggle={toggle}
              slug={category.slug}
            />
          ))}
        </ScrollView>
        <SheetFooter>
          <SheetClose>
            <Button>{t("search.showResults")}</Button>
          </SheetClose>
          <Button disabled={count === 0} onPress={clear} variant="ghost">
            {t("search.clearFilter")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
