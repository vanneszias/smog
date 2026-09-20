import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoritesList } from "@/components/FavoritesList";
import { accountFavoriteIds } from "@/lib/accountFavorites";
import { isLocale } from "@/lib/locale";
import { readSession } from "@/lib/session";

export const metadata: Metadata = {
  description: "De gebaren die je bewaard hebt.",
  title: "Favorieten",
  /*
   * Nothing here is worth indexing — the page is a shell whose contents
   * belong to one reader — and a crawler that did index it would index the
   * empty state as the page's content.
   */
  robots: { follow: true, index: false },
};

/**
 * The favorites shell.
 *
 * Unlike every other page in this group there is **no** `dynamic =
 * "force-dynamic"` here, and its absence is still deliberate: this page
 * issues no query of its own, so there is nothing for the build-phase
 * placeholder bindings to fail on. It is nonetheless rendered per request,
 * because the layout above it reads the session — the route table and the
 * reasoning are in the Stage 4 Task 4 report.
 *
 * **The session read here is free, and that is why it is here.** `readSession`
 * is `cache`d, so the layout's header and this page share one `payload.auth`.
 * Resolving the ids on the server instead of asking the browser for them is
 * what keeps the signed-in list from painting the *guest's* favorites first
 * and then replacing them.
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

  const user = await readSession();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Favorieten</h1>
        {/*
         * Said on the page rather than only in a commit message. A guest's
         * favorites live in this browser and nowhere else, and a reader who
         * clears their site data or opens the site on their phone deserves
         * to know that before it surprises them. A signed-in reader is told
         * the opposite, because for them it is no longer true.
         */}
        <p
          className="text-foreground-muted text-sm"
          data-testid="favorites-scope"
        >
          {user === null
            ? "Je favorieten worden alleen in deze browser bewaard. Met een account kun je ze later op al je apparaten terugvinden."
            : "Je favorieten zijn aan je account gekoppeld en staan op al je apparaten klaar."}
        </p>
      </div>

      <FavoritesList
        accountFavoriteIds={user === null ? null : accountFavoriteIds(user)}
        locale={locale}
      />
    </div>
  );
}
