import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { CategoryList } from "@/components/admin/catalog/category-list";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
  head: ({ matches }) => pageMeta(matches, "admin.categories.title"),
});

/** `/admin/categories` (A-22): the categories, their order and publishing. */
function AdminCategories(): ReactNode {
  const { t } = useTranslation();
  return (
    <AdminPage
      description={t("admin.categories.description")}
      title={t("admin.categories.title")}
    >
      <CategoryList />
    </AdminPage>
  );
}
