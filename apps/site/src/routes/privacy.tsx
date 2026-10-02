import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LegalPage,
  legalHead,
  validateLegalSearch,
} from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: ({ matches }) => legalHead(matches, "privacy"),
  validateSearch: validateLegalSearch,
});

function Privacy(): ReactNode {
  return <LegalPage kind="privacy" search={Route.useSearch()} />;
}
