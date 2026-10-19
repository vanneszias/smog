import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { ExportDialog } from "@/components/admin/sponsorships/export-dialog";
import {
  type SponsorshipSearch,
  validateSponsorshipSearch,
} from "@/components/admin/sponsorships/search";
import { SponsorshipTable } from "@/components/admin/sponsorships/sponsorship-table";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/sponsorships/")({
  component: AdminSponsorships,
  head: ({ matches }) => pageMeta(matches, "admin.sponsorships.title"),
  validateSearch: validateSponsorshipSearch,
});

/**
 * `/admin/sponsorships` (A-04, A-08, A-09): the moderation queue first,
 * every sponsorship by tab with URL filters, and the CSV export.
 */
function AdminSponsorships(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: SponsorshipSearch) => {
      // Typing replaces the entry; tabs, filters and pages push one.
      navigate({ replace: next.q !== search.q, search: next }).catch(
        (error: unknown) => {
          console.error(
            "[admin] Failed to update the sponsorship filters:",
            error
          );
        }
      );
    },
    [navigate, search.q]
  );
  return (
    <AdminPage
      actions={
        <ExportDialog
          from={search.from}
          status={search.tab === "all" ? search.status : undefined}
          to={search.to}
        />
      }
      description={t("admin.sponsorships.description")}
      title={t("admin.sponsorships.title")}
    >
      <SponsorshipTable onSearchChange={onSearchChange} search={search} />
    </AdminPage>
  );
}
