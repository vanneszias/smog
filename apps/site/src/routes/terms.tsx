import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LegalPage,
  legalHead,
  validateLegalSearch,
} from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: ({ matches }) => legalHead(matches, "terms"),
  validateSearch: validateLegalSearch,
});

function Terms(): ReactNode {
  return <LegalPage kind="terms" search={Route.useSearch()} />;
}
