import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  type AuditSearch,
  AuditTable,
  validateAuditSearch,
} from "@/components/admin/audit-table";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAudit,
  head: ({ matches }) => pageMeta(matches, "admin.audit.title"),
  validateSearch: validateAuditSearch,
});

/** `/admin/audit` (A-24): every admin change, filterable, newest first. */
function AdminAudit(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: AuditSearch) => {
      navigate({ search: next }).catch((error: unknown) => {
        console.error("[admin] Failed to update the audit filters:", error);
      });
    },
    [navigate]
  );
  return (
    <AdminPage
      description={t("admin.audit.description")}
      title={t("admin.audit.title")}
    >
      <AuditTable onSearchChange={onSearchChange} search={search} />
    </AdminPage>
  );
}
