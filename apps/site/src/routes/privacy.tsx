import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { legalHead, validateLegalSearch } from "@/components/legal-head";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: ({ loaderData, matches }) => legalHead(matches, "privacy", loaderData),
  // The texts load on demand: a lazy import keeps them out of every other page.
  loader: async () => {
    const { legalMeta } = await import("@/components/legal-page");
    return legalMeta("privacy");
  },
  validateSearch: validateLegalSearch,
});

function Privacy(): ReactNode {
  return <LegalPage kind="privacy" search={Route.useSearch()} />;
}
