import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  EmailPreview,
  type EmailPreviewSearch,
  validateEmailPreviewSearch,
} from "@/components/admin/email-preview";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/emails")({
  component: AdminEmails,
  head: ({ matches }) => pageMeta(matches, "admin.emails.title"),
  validateSearch: validateEmailPreviewSearch,
});

/**
 * `/admin/emails` (A-25, W-07): every registered template rendered with
 * its sample in nl, en or fr, at desktop or phone width. Nothing is sent.
 */
function AdminEmails(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: EmailPreviewSearch) => {
      navigate({ search: next }).catch((error: unknown) => {
        console.error("[admin] Failed to update the email preview:", error);
      });
    },
    [navigate]
  );
  return (
    <AdminPage
      description={t("admin.emails.description")}
      title={t("admin.emails.title")}
    >
      <EmailPreview onSearchChange={onSearchChange} search={search} />
    </AdminPage>
  );
}
