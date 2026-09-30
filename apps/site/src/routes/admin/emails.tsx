import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminComingSoon } from "@/components/admin/admin-page";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/emails")({
  component: AdminEmails,
  head: ({ matches }) => pageMeta(matches, "admin.emails.title"),
});

/** A placeholder: Task 6 (the email previews) replaces this file. */
function AdminEmails(): ReactNode {
  const { t } = useTranslation();
  return <AdminComingSoon title={t("admin.emails.title")} />;
}
