import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminComingSoon } from "@/components/admin/admin-page";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
  head: ({ matches }) => pageMeta(matches, "admin.users.title"),
});

/** A placeholder: Task 5 (the users table and the user panel) replaces this file. */
function AdminUsers(): ReactNode {
  const { t } = useTranslation();
  return <AdminComingSoon title={t("admin.users.title")} />;
}
