import { useTranslation } from "@smog/i18n/react";
import { useTeacherInfo } from "@smog/lessons/client";
import { Button, EmptyState, ErrorState, Skeleton } from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { errorCode } from "@/components/admin/catalog/errors";
import { TeacherInfoPanel } from "@/components/admin/teacher/teacher-info-card";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/teacher-info/$id")({
  component: AdminTeacherInfo,
  head: ({ matches }) => pageMeta(matches, "admin.teacherInfo.title"),
});

/**
 * `/admin/teacher-info/$id` (phase 10c task 2): one gesture's private
 * teaching text. Open to a teacher, a translator or an admin (the gate
 * narrows the first two to this screen); an admin also finds the same card
 * in the gesture editor. The procedures check the role again on every call.
 */
function AdminTeacherInfo(): ReactNode {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const info = useTeacherInfo(id);
  const { refetch } = info;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[lessons] Failed to reload the teacher info:", error);
    });
  }, [refetch]);
  const gesture = info.data?.gesture;
  let body: ReactNode = <Skeleton className="h-96 w-full" />;
  if (info.isError && errorCode(info.error) === "NOT_FOUND") {
    body = (
      <EmptyState
        description={t("admin.gestures.editor.notFound.description")}
        icon={<SearchX />}
        level={2}
        title={t("admin.gestures.editor.notFound.title")}
      />
    );
  } else if (info.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else if (gesture) {
    body = <TeacherInfoPanel gestureId={gesture.id} />;
  }
  return (
    <AdminPage
      actions={
        gesture?.published ? (
          <Button asChild variant="secondary">
            <Link params={{ slug: gesture.slug }} to="/gestures/$slug">
              {t("admin.teacherInfo.backToGesture")}
            </Link>
          </Button>
        ) : null
      }
      description={gesture?.name}
      title={t("admin.teacherInfo.title")}
    >
      {body}
    </AdminPage>
  );
}
