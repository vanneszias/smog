import { useTranslation } from "@smog/i18n/react";
import { Button } from "@smog/ui-web";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Table2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  GestureList,
  type GestureListSearch,
  validateGestureListSearch,
} from "@/components/admin/catalog/gesture-list";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/gestures/")({
  component: AdminGestures,
  head: ({ matches }) => pageMeta(matches, "admin.gestures.title"),
  validateSearch: validateGestureListSearch,
});

/** `/admin/gestures` (A-18–A-21): every gesture, filterable, editable as a table. */
function AdminGestures(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [editing, setEditing] = useState(false);
  const onSearchChange = useCallback(
    (next: GestureListSearch) => {
      navigate({ search: next }).catch((error: unknown) => {
        console.error("[admin] Failed to update the gesture filters:", error);
      });
    },
    [navigate]
  );
  const startEditing = useCallback(() => setEditing(true), []);
  return (
    <AdminPage
      actions={
        editing ? null : (
          <>
            <Button
              icon={<Table2 />}
              onClick={startEditing}
              variant="secondary"
            >
              {t("admin.gestures.editTable")}
            </Button>
            <Button asChild>
              <Link to="/admin/gestures/new">
                <Plus aria-hidden="true" className="size-5" />
                {t("admin.gestures.new")}
              </Link>
            </Button>
          </>
        )
      }
      description={t("admin.gestures.description")}
      title={t("admin.gestures.title")}
    >
      <GestureList
        editing={editing}
        onEditingChange={setEditing}
        onSearchChange={onSearchChange}
        search={search}
      />
    </AdminPage>
  );
}
