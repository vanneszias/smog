import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { legalHead, validateLegalSearch } from "@/components/legal-head";
import { LegalPage } from "@/components/legal-page";
import { legalDeps, legalLoader } from "@/lib/legal-loader";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: ({ loaderData, matches }) =>
    legalHead(matches, "privacy", loaderData?.meta),
  // The published text comes from D1: an edit shows without a deploy.
  loader: legalLoader("privacy"),
  loaderDeps: legalDeps,
  validateSearch: validateLegalSearch,
});

function Privacy(): ReactNode {
  const { texts } = Route.useLoaderData();
  return <LegalPage kind="privacy" search={Route.useSearch()} texts={texts} />;
}
