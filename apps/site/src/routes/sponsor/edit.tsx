import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Page } from "@/components/learning/page";
import { ReeditView } from "@/components/sponsor/reedit-view";
import { pageMeta } from "@/lib/head";
import { validateTokenSearch } from "@/lib/sponsor-search";
import { tokenPageHead, tokenPageHeaders } from "@/lib/token-page";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/sponsor/edit")({
  component: EditPage,
  head: ({ matches }) =>
    tokenPageHead(pageMeta(matches, "sponsor.edit.eyebrow")),
  headers: tokenPageHeaders,
  validateSearch: validateTokenSearch,
});

/** The re-edit link (S-19, ruling 11). */
function EditPage(): ReactNode {
  const { token } = Route.useSearch();
  const { auth } = rootApi.useLoaderData();
  return (
    <Page>
      <ReeditView
        token={token ?? null}
        turnstileSiteKey={auth.turnstileSiteKey}
      />
    </Page>
  );
}
