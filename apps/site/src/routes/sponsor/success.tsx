import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Page } from "@/components/learning/page";
import { PaymentResult } from "@/components/sponsor/payment-result";
import { pageMeta } from "@/lib/head";
import { validatePaymentSearch } from "@/lib/sponsor-search";

export const Route = createFileRoute("/sponsor/success")({
  component: SuccessPage,
  head: ({ matches }) => pageMeta(matches, "sponsor.success.title"),
  validateSearch: validatePaymentSearch,
});

/** Mollie's return page (S-14), for checkouts and renewals alike. */
function SuccessPage(): ReactNode {
  const { payment } = Route.useSearch();
  return (
    <Page>
      <PaymentResult payment={payment ?? null} />
    </Page>
  );
}
