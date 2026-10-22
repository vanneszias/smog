import type { Category } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { HandIllustration, type HandIndex, Heading } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const HANDS: readonly HandIndex[] = [0, 1, 2];

/**
 * Home's categories: an illustrated chip per category (a brand hand, the
 * three in turn, until categories carry their own image) that opens the
 * gestures filtered by it. A navigation landmark: these are links, unlike
 * the filter chips of the browse page.
 */
export function CategoryTiles({
  categories,
}: {
  categories: readonly Pick<Category, "name" | "slug">[];
}): ReactNode {
  const { t } = useTranslation();
  if (categories.length === 0) {
    return null;
  }
  return (
    <nav aria-label={t("search.categories")} className="flex flex-col gap-4">
      <Heading level={2} size="title-2">
        {t("landing.categoriesIntro")}
      </Heading>
      <ul className="flex flex-wrap gap-3">
        {categories.map((category, index) => (
          <li key={category.slug}>
            <Link
              className="inline-flex min-h-14 items-center gap-3 rounded-full border border-border bg-card py-1.5 pr-5 pl-2 font-medium text-foreground outline-none transition duration-fast ease-standard hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
              search={{ category: category.slug }}
              to="/gestures"
            >
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary-subtle">
                <HandIllustration
                  className="h-7"
                  hand={HANDS[index % HANDS.length] ?? 0}
                />
              </span>
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
