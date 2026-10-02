import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { pageMeta } from "@/lib/head";
import { getDevUiEnabled } from "@/server/dev-tools.functions";

/**
 * A dev and staging preview of `VideoField` inside the admin layout, for
 * its e2e and screenshots until the gesture editor (Task 4) uses it. Like
 * `/dev/ui`, production builds compile it out (`__SMOG_DEV_TOOLS__`) and
 * answer 404.
 */
const Preview = __SMOG_DEV_TOOLS__
  ? lazy(() =>
      import("@/components/admin/video/video-field-preview").then((module) => ({
        default: module.VideoFieldPreview,
      }))
    )
  : null;

export const Route = createFileRoute("/admin/dev/video-field")({
  beforeLoad: async () => {
    if (!(Preview && (await getDevUiEnabled()))) {
      throw notFound();
    }
  },
  component: VideoFieldPage,
  head: ({ matches }) => pageMeta(matches, "admin.mux.title"),
});

function VideoFieldPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <AdminPage title={t("admin.mux.title")}>
      {Preview ? (
        <Suspense fallback={null}>
          <Preview />
        </Suspense>
      ) : null}
    </AdminPage>
  );
}
