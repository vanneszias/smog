import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminComingSoon } from "@/components/admin/admin-page";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
  head: ({ matches }) => pageMeta(matches, "admin.settings.title"),
});

/** A placeholder: Task 6 (maintenance mode and the bypass cookie) replaces this file. */
function AdminSettings(): ReactNode {
  const { t } = useTranslation();
  return <AdminComingSoon title={t("admin.settings.title")} />;
}
