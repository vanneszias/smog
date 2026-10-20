import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { legalHead, validateLegalSearch } from "@/components/legal-head";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: ({ loaderData, matches }) => legalHead(matches, "terms", loaderData),
  // The texts load on demand: a lazy import keeps them out of every other page.
  loader: async () => {
    const { legalMeta } = await import("@/components/legal-page");
    return legalMeta("terms");
  },
  validateSearch: validateLegalSearch,
});

function Terms(): ReactNode {
  return <LegalPage kind="terms" search={Route.useSearch()} />;
}
