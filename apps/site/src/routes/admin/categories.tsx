import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminComingSoon } from "@/components/admin/admin-page";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
  head: ({ matches }) => pageMeta(matches, "admin.categories.title"),
});

/** A placeholder: Task 4 (the category list and reorder) replaces this file. */
function AdminCategories(): ReactNode {
  const { t } = useTranslation();
  return <AdminComingSoon title={t("admin.categories.title")} />;
}
