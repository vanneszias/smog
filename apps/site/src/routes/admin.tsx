import { SidebarProvider } from "@smog/ui-web";
import {
  createFileRoute,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminRail } from "@/components/admin/admin-rail";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import {
  isAdminHome,
  TRANSLATION_HOME,
  translatorMayOpen,
} from "@/lib/admin-access";
import { pageMeta } from "@/lib/head";
import { getAdminGate } from "@/server/admin-gate.functions";

/**
 * `/admin/*` (spec §9, §16): the gated admin layout. The gate runs on every
 * admin navigation (ruling 10): a guest goes to sign-in, an account that is
 * neither admin nor translator gets the 404 page, an admin gets the
 * sidebar, the breadcrumbs and the screen, a translator the translation
 * screens only. The procedures check the role again on every call. Never
 * indexed.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const { user } = await getAdminGate({ data: location.href });
    // A translator (not an admin) sees the translation screens only: the
    // dashboard leads to the strings, anything else is the 404 page.
    if (!user.roles.includes("admin")) {
      if (isAdminHome(location.pathname)) {
        throw redirect({ replace: true, to: TRANSLATION_HOME });
      }
      if (!translatorMayOpen(location.pathname)) {
        throw notFound();
      }
    }
    return { admin: user };
  },
  component: AdminLayout,
  head: ({ matches }) => pageMeta(matches, "admin.title"),
});

function AdminLayout(): ReactNode {
  return (
    <SidebarProvider className="min-h-0 flex-1">
      <AdminRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminToolbar />
        <Outlet />
      </div>
    </SidebarProvider>
  );
}
