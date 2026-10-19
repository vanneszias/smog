import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Page } from "@/components/learning/page";
import { RenewalView } from "@/components/sponsor/renewal-view";
import { pageMeta } from "@/lib/head";
import { validateTokenSearch } from "@/lib/sponsor-search";
import { tokenPageHead, tokenPageHeaders } from "@/lib/token-page";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/sponsor/renew")({
  component: RenewPage,
  head: ({ matches }) =>
    tokenPageHead(pageMeta(matches, "sponsor.renew.eyebrow")),
  headers: tokenPageHeaders,
  validateSearch: validateTokenSearch,
});

/** The renewal link from the reminder email (S-20, ruling 11). */
function RenewPage(): ReactNode {
  const { token } = Route.useSearch();
  const { auth } = rootApi.useLoaderData();
  return (
    <Page>
      <RenewalView
        token={token ?? null}
        turnstileSiteKey={auth.turnstileSiteKey}
      />
    </Page>
  );
}
