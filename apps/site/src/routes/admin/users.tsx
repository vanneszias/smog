import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { UserPanel } from "@/components/admin/users/user-panel";
import {
  type UserSearch,
  UserTable,
  validateUserSearch,
} from "@/components/admin/users/user-table";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
  head: ({ matches }) => pageMeta(matches, "admin.users.title"),
  validateSearch: validateUserSearch,
});

/**
 * `/admin/users` (A-23): accounts with URL filters; `?user=<id>` opens the
 * account's panel with the role, ban and delete actions (rulings 6 and 7).
 * `bun run admin:grant` stays the way to make the first admin (spec §6).
 */
function AdminUsers(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const { admin } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: UserSearch) => {
      // Typing replaces the entry; pages, filters and the panel push one.
      navigate({ replace: next.q !== search.q, search: next }).catch(
        (error: unknown) => {
          console.error("[admin] Failed to update the user filters:", error);
        }
      );
    },
    [navigate, search.q]
  );
  const closePanel = useCallback(
    () => onSearchChange({ ...search, user: undefined }),
    [onSearchChange, search]
  );
  return (
    <AdminPage
      description={t("admin.users.description")}
      title={t("admin.users.title")}
    >
      <UserTable
        actorId={admin.id}
        onSearchChange={onSearchChange}
        search={search}
      />
      <UserPanel
        actorId={admin.id}
        onClose={closePanel}
        userId={search.user ?? null}
      />
    </AdminPage>
  );
}
