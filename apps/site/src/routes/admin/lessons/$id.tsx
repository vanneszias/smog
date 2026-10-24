import { useTranslation } from "@smog/i18n/react";
import { useLesson } from "@smog/lessons/client";
import { Button, EmptyState, ErrorState, Skeleton } from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { errorCode } from "@/components/admin/catalog/errors";
import { LessonBuilder } from "@/components/admin/lessons/lesson-builder";
import { lessonTitle } from "@/components/admin/lessons/lesson-list";
import { pageMeta } from "@/lib/head";
import { useLocale } from "@/lib/locale";

export const Route = createFileRoute("/admin/lessons/$id")({
  component: AdminLesson,
  head: ({ matches }) => pageMeta(matches, "admin.lessons.builder.title"),
});

/**
 * `/admin/lessons/$id` (phase 10c task 4): the lesson builder. The author
 * and admins edit; another teacher reads it and can make a copy.
 */
function AdminLesson(): ReactNode {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { locale } = useLocale();
  const lesson = useLesson(id);
  const { refetch } = lesson;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[lessons] Failed to reload the lesson:", error);
    });
  }, [refetch]);
  let body: ReactNode = <Skeleton className="h-96 w-full" />;
  if (lesson.isError && errorCode(lesson.error) === "NOT_FOUND") {
    body = (
      <EmptyState
        description={t("admin.lessons.notFound.description")}
        icon={<SearchX />}
        level={2}
        title={t("admin.lessons.notFound.title")}
      />
    );
  } else if (lesson.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else if (lesson.data) {
    body = <LessonBuilder lesson={lesson.data} />;
  }
  const { data } = lesson;
  const heading = data
    ? lessonTitle(t, {
        title:
          data.translations[locale]?.title ||
          Object.values(data.translations).find((text) => text.title)?.title ||
          "",
      })
    : t("admin.lessons.builder.title");
  return (
    <AdminPage
      actions={
        <Button asChild variant="secondary">
          <Link to="/admin/lessons">{t("admin.lessons.backToList")}</Link>
        </Button>
      }
      description={
        data?.number === null || data === undefined
          ? undefined
          : t("admin.lessons.numbered", { number: data.number })
      }
      title={heading}
    >
      {body}
    </AdminPage>
  );
}
