import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Page, RouteError } from "@/components/learning/page";
import { SponsorWizard } from "@/components/sponsor/wizard";
import { seoHead, shellHead } from "@/lib/head";
import { preselectSlugs, validateSponsorSearch } from "@/lib/sponsor-search";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/sponsor/")({
  component: SponsorPage,
  // A failure that escapes the wizard keeps the page and its language (I-1).
  errorComponent: RouteError,
  head: ({ matches }) => {
    const { t } = shellHead(matches);
    return seoHead(matches, {
      description: t("sponsor.meta.description"),
      path: "/sponsor",
      title: t("sponsor.meta.title"),
    });
  },
  validateSearch: validateSponsorSearch,
});

/**
 * `/sponsor` (S-01–S-11): the wizard, `?gesture=` preselected (ruling 13).
 * A new preselect (Try again on the success page) starts a new run.
 */
function SponsorPage(): ReactNode {
  const { gesture } = Route.useSearch();
  const { auth } = rootApi.useLoaderData();
  return (
    <Page>
      <SponsorWizard
        key={gesture ?? ""}
        preselect={preselectSlugs(gesture)}
        turnstileSiteKey={auth.turnstileSiteKey}
      />
    </Page>
  );
}
