import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LegalPage, legalHead } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: ({ matches }) => legalHead(matches, "privacy"),
});

function Privacy(): ReactNode {
  return <LegalPage kind="privacy" />;
}
