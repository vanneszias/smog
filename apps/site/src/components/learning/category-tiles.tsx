import type { Category } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { Heading } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCatalogDisplay } from "./catalog-display";

/**
 * Home's categories as a contents page: each theme by name with its number
 * of gestures, text only (no hand: each hand has one meaning, and none of
 * them means "a theme"), in one to three columns. Each row opens the
 * gestures filtered by it. A navigation landmark: these are links, unlike
 * the filter chips of the browse page.
 */
export function CategoryTiles({
  categories,
}: {
  categories: readonly Pick<
    Category,
    "fallbackUsed" | "gestureCount" | "name" | "slug"
  >[];
}): ReactNode {
  const { t } = useTranslation();
  const display = useCatalogDisplay();
  if (categories.length === 0) {
    return null;
  }
  return (
    <nav aria-labelledby="home-contents-title" className="flex flex-col gap-6">
      <Heading id="home-contents-title" level={2} size="title-1">
        {t("home.contentsTitle")}
      </Heading>
      <ul className="gap-x-12 sm:columns-2 lg:columns-3">
        {categories.map((item) => {
          const category = display.category(item);
          return (
            <li
              className="break-inside-avoid border-border-subtle border-t"
              key={category.slug}
            >
              <Link
                className="group flex min-h-touch items-baseline gap-4 rounded-md py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                search={{ category: category.slug }}
                to="/gestures"
              >
                <span
                  className="min-w-0 flex-1 text-pretty font-medium text-body text-foreground underline-offset-4 group-hover:text-primary-strong group-hover:underline"
                  lang={category.lang}
                >
                  {category.name}
                </span>
                <span
                  aria-hidden="true"
                  className="text-body-sm text-muted-foreground tabular-nums"
                >
                  {category.gestureCount}
                </span>
                <span className="sr-only">
                  {t("search.resultCount", { count: category.gestureCount })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
