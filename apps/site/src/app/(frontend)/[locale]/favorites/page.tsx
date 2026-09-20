import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoritesList } from "@/components/FavoritesList";
import { isLocale } from "@/lib/locale";

export const metadata: Metadata = {
  description: "De gebaren die je in deze browser hebt bewaard.",
  title: "Favorieten",
  /*
   * Nothing here is worth indexing — the page is a shell whose contents live
   * in one reader's browser — and a crawler that did index it would index the
   * empty state as the page's content.
   */
  robots: { follow: true, index: false },
};

/**
 * The favorites shell.
 *
 * Unlike every other page in this group there is **no** `dynamic =
 * "force-dynamic"` here, and its absence is deliberate: this page issues no
 * query, so there is nothing for the build-phase placeholder bindings to
 * fail on, and a prerendered shell is exactly right for a page whose contents
 * arrive from the browser. The island below it does the work.
 *
 * The locale check is repeated from the layout for the same reason the other
 * pages repeat it: `notFound()` in a layout is caught by the boundary *above*
 * it, so the two render different pages.
 */
export default async function FavoritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Favorieten</h1>
        {/*
         * Said on the page rather than only in a commit message. Guest
         * favorites live in this browser and nowhere else until Stage 4 adds
         * accounts, and a reader who clears their site data or opens the site
         * on their phone deserves to know that before it surprises them.
         */}
        <p className="text-foreground-muted text-sm">
          Je favorieten worden alleen in deze browser bewaard. Met een account
          kun je ze later op al je apparaten terugvinden.
        </p>
      </div>

      <FavoritesList locale={locale} />
    </div>
  );
}
