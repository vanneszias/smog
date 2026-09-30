import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminComingSoon } from "@/components/admin/admin-page";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/gestures/$id")({
  component: AdminGesture,
  head: ({ matches }) => pageMeta(matches, "admin.gestures.title"),
});

/** A placeholder: Task 4 (the gesture editor; `new` too, until Task 4 adds `gestures/new.tsx`) replaces this file. */
function AdminGesture(): ReactNode {
  const { t } = useTranslation();
  return <AdminComingSoon title={t("admin.gestures.title")} />;
}
