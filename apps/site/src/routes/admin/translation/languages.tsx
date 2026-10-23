import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { LanguagesTable } from "@/components/admin/translation/languages-table";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/translation/languages")({
  component: AdminLanguages,
  head: ({ matches }) => pageMeta(matches, "admin.translation.languages.title"),
});

/**
 * `/admin/translation/languages` (phase 10b task 4, admin only): which
 * languages exist, their own names and `Intl` tags, their order and whether
 * the menu offers them.
 */
function AdminLanguages(): ReactNode {
  const { t } = useTranslation();
  return (
    <AdminPage
      description={t("admin.translation.languages.description")}
      title={t("admin.translation.languages.title")}
    >
      <LanguagesTable />
    </AdminPage>
  );
}
