import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Page, RouteError } from "@/components/learning/page";
import { ReeditView } from "@/components/sponsor/reedit-view";
import { useLinkToken } from "@/components/sponsor/use-link-token";
import { pageMeta } from "@/lib/head";
import { tokenPageHead, tokenPageHeaders } from "@/lib/token-page";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/sponsor/edit")({
  component: EditPage,
  // A failure that escapes the page keeps the page and its language (I-1).
  errorComponent: RouteError,
  head: ({ matches }) =>
    tokenPageHead(pageMeta(matches, "sponsor.edit.eyebrow")),
  headers: tokenPageHeaders,
});

/** The re-edit link (S-19, ruling 11). */
function EditPage(): ReactNode {
  const token = useLinkToken();
  const { auth } = rootApi.useLoaderData();
  return (
    <Page>
      <ReeditView token={token} turnstileSiteKey={auth.turnstileSiteKey} />
    </Page>
  );
}
