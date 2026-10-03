import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SponsorshipDetail } from "@/components/admin/sponsorships/sponsorship-detail";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/sponsorships/$id")({
  component: AdminSponsorship,
  head: ({ matches }) => pageMeta(matches, "admin.sponsorships.title"),
});

/** `/admin/sponsorships/$id` (A-15, A-29): one sponsorship, from D1. */
function AdminSponsorship(): ReactNode {
  const { id } = Route.useParams();
  // A new id is a new detail (never another sponsorship's dialogs).
  return <SponsorshipDetail id={id} key={id} />;
}
