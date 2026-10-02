import { useAdminGesture } from "@smog/admin/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, EmptyState, ErrorState, Skeleton } from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { errorCode } from "@/components/admin/catalog/errors";
import { GestureEditor } from "@/components/admin/catalog/gesture-editor";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/gestures/$id")({
  component: AdminGesture,
  head: ({ matches }) => pageMeta(matches, "admin.gestures.title"),
});

/** `/admin/gestures/$id` (A-17): one gesture in the editor, from D1. */
function AdminGesture(): ReactNode {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const gesture = useAdminGesture(id);
  const { refetch } = gesture;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the gesture:", error);
    });
  }, [refetch]);
  if (gesture.data) {
    // A new id is a new form (never another gesture's edits).
    return <GestureEditor gesture={gesture.data} key={gesture.data.id} />;
  }
  let body: ReactNode;
  if (gesture.isError && errorCode(gesture.error) === "NOT_FOUND") {
    body = (
      <EmptyState
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/gestures">{t("admin.gestures.editor.back")}</Link>
          </Button>
        }
        description={t("admin.gestures.editor.notFound.description")}
        icon={<SearchX />}
        level={2}
        title={t("admin.gestures.editor.notFound.title")}
      />
    );
  } else if (gesture.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <AdminPage title={t("admin.gestures.title")}>{body}</AdminPage>;
}
