import { useTranslation } from "@smog/i18n/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@smog/ui-web";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { FavoritesPanel } from "@/components/learning/favorites-panel";
import { ListsPanel } from "@/components/learning/lists/lists-panel";
import { SharedPanel } from "@/components/learning/lists/shared-panel";
import { Page, PageHeader, RouteError } from "@/components/learning/page";
import { pageMeta } from "@/lib/head";

const TABS = ["favorites", "lists", "shared"] as const;
type Tab = (typeof TABS)[number];

export interface MySearch {
  /** The selected list (the Lists tab). */
  id?: string;
  /** The tab; Favorites when absent. */
  tab?: Tab;
}

function isTab(value: unknown): value is Tab {
  return TABS.some((tab) => tab === value);
}

/**
 * `?tab=` (Favorites by default) and, on Lists, `?id=` (the open list).
 * Anything else is dropped, so a stale or odd URL still opens My space.
 */
export function validateMySearch(search: Record<string, unknown>): MySearch {
  const tab = isTab(search.tab) ? search.tab : undefined;
  const id =
    tab === "lists" && typeof search.id === "string" && search.id.length > 0
      ? search.id.slice(0, 64)
      : undefined;
  return { ...(id ? { id } : {}), ...(tab ? { tab } : {}) };
}

export const Route = createFileRoute("/my")({
  component: MySpace,
  errorComponent: RouteError,
  head: ({ matches }) => pageMeta(matches, "mySpace.title"),
  validateSearch: validateMySearch,
});

/**
 * My space (phase 10a): Favorites and Lists as tabs, the device's for
 * guests and the account's when signed in (the hooks pick; the screen does
 * not). `/favorites` and `/lists` answer a 302 to here.
 */
function MySpace(): ReactNode {
  const { t } = useTranslation();
  const { tab = "favorites" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const select = useCallback(
    (value: string): void => {
      if (isTab(value) && value !== tab) {
        navigate({ search: { tab: value } }).catch((error: unknown) => {
          console.error("[my] Failed to open the tab:", error);
        });
      }
    },
    [navigate, tab]
  );
  return (
    <Page>
      <PageHeader
        description={t("mySpace.description")}
        title={t("mySpace.title")}
      />
      <Tabs onValueChange={select} value={tab}>
        <TabsList aria-label={t("mySpace.sections")}>
          <TabsTrigger value="favorites">{t("nav.favorites")}</TabsTrigger>
          <TabsTrigger value="lists">{t("nav.lists")}</TabsTrigger>
          <TabsTrigger value="shared">{t("mySpace.shared.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="favorites">
          <FavoritesPanel />
        </TabsContent>
        <TabsContent value="lists">
          <ListsPanel />
        </TabsContent>
        <TabsContent value="shared">
          <SharedPanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
