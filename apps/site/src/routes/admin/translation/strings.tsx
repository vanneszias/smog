import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { CoverageCard } from "@/components/admin/translation/coverage";
import {
  ExportMenu,
  ImportDialog,
} from "@/components/admin/translation/import-export";
import {
  type StringsSearch,
  validateStringsSearch,
} from "@/components/admin/translation/strings-search";
import { StringsTable } from "@/components/admin/translation/strings-table";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/translation/strings")({
  component: AdminStrings,
  head: ({ matches }) => pageMeta(matches, "admin.translation.strings.title"),
  validateSearch: validateStringsSearch,
});

/**
 * `/admin/translation/strings` (phase 10b task 4): the interface strings
 * of the site, the app and the emails, one column per enabled language,
 * with the coverage, import and export. Translators and admins.
 */
function AdminStrings(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: StringsSearch) => {
      navigate({ search: next }).catch((error: unknown) => {
        console.error("[admin] Failed to update the string filters:", error);
      });
    },
    [navigate]
  );
  return (
    <AdminPage
      actions={
        <>
          <ExportMenu />
          <ImportDialog />
        </>
      }
      description={t("admin.translation.strings.description")}
      title={t("admin.translation.strings.title")}
    >
      <CoverageCard />
      <StringsTable onSearchChange={onSearchChange} search={search} />
    </AdminPage>
  );
}
