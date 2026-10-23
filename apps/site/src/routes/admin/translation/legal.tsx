import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  LegalScreen,
  type LegalSearch,
  validateLegalAdminSearch,
} from "@/components/admin/translation/legal-screen";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/translation/legal")({
  component: AdminLegal,
  head: ({ matches }) => pageMeta(matches, "admin.translation.legal.title"),
  validateSearch: validateLegalAdminSearch,
});

/**
 * `/admin/translation/legal` (phase 10b task 7): the privacy notice and the
 * terms per language, as versioned texts a translator or an admin publishes.
 */
function AdminLegal(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: LegalSearch) => {
      navigate({ search: next }).catch((error: unknown) => {
        console.error("[admin] Failed to change the legal text:", error);
      });
    },
    [navigate]
  );
  return (
    <AdminPage
      description={t("admin.translation.legal.description")}
      title={t("admin.translation.legal.title")}
    >
      <LegalScreen onSearchChange={onSearchChange} search={search} />
    </AdminPage>
  );
}
