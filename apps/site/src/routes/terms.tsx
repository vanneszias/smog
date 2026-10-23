import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { legalHead, validateLegalSearch } from "@/components/legal-head";
import { LegalPage } from "@/components/legal-page";
import { legalDeps, legalLoader } from "@/lib/legal-loader";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: ({ loaderData, matches }) =>
    legalHead(matches, "terms", loaderData?.meta),
  // The published text comes from D1: an edit shows without a deploy.
  loader: legalLoader("terms"),
  loaderDeps: legalDeps,
  validateSearch: validateLegalSearch,
});

function Terms(): ReactNode {
  const { texts } = Route.useLoaderData();
  return <LegalPage kind="terms" search={Route.useSearch()} texts={texts} />;
}
