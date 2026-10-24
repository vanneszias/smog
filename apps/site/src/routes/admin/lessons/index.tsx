import { useTranslation } from "@smog/i18n/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  LessonList,
  NewLessonButton,
} from "@/components/admin/lessons/lesson-list";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/lessons/")({
  component: AdminLessons,
  head: ({ matches }) => pageMeta(matches, "admin.lessons.title"),
});

/**
 * `/admin/lessons` (phase 10c task 4): every teacher's lessons. Open to a
 * teacher or an admin (the admin gate narrows a teacher to this and the
 * teacher-info screen); the procedures check the role again on every call.
 */
function AdminLessons(): ReactNode {
  const { t } = useTranslation();
  return (
    <AdminPage
      actions={<NewLessonButton />}
      description={t("admin.lessons.description")}
      title={t("admin.lessons.title")}
    >
      <LessonList />
    </AdminPage>
  );
}
