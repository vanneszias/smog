import { SidebarProvider } from "@smog/ui-web";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AdminRail } from "@/components/admin/admin-rail";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import { pageMeta } from "@/lib/head";
import { getAdminGate } from "@/server/admin-gate.functions";

/**
 * `/admin/*` (spec §9, §16): the gated admin layout. The gate runs on every
 * admin navigation (ruling 10): a guest goes to sign-in, a signed-in
 * non-admin gets the 404 page, an admin gets the sidebar, the breadcrumbs and the screen. The
 * procedures check the role again on every call. Never indexed.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const { user } = await getAdminGate({ data: location.href });
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
