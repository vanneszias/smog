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
  lessonsMayOpen,
  TEACHER_HOME,
  TRANSLATION_HOME,
  teacherInfoMayOpen,
  translatorMayOpen,
} from "@/lib/admin-access";
import { pageMeta } from "@/lib/head";
import { getAdminGate } from "@/server/admin-gate.functions";

/**
 * `/admin/*` (spec §9, §16): the gated admin layout. The gate runs on every
 * admin navigation (ruling 10): a guest goes to sign-in, an account that is
 * neither admin, translator nor teacher gets the 404 page, an admin gets the
 * sidebar, the breadcrumbs and the screen, a translator the translation
 * screens and the teacher information, a teacher the lessons and the teacher
 * information. The procedures check the role again on every call. Never
 * indexed.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const { user } = await getAdminGate({ data: location.href });
    // Not an admin: a translator sees the translation screens, a teacher the
    // lessons, and both the teacher information of one gesture. The dashboard
    // leads a translator to the strings and a teacher to the lessons; anything
    // else is the 404 page.
    if (!user.roles.includes("admin")) {
      const translator = user.roles.includes("translator");
      const teacher = user.roles.includes("teacher");
      if (isAdminHome(location.pathname)) {
        if (translator) {
          throw redirect({ replace: true, to: TRANSLATION_HOME });
        }
        if (teacher) {
          throw redirect({ replace: true, to: TEACHER_HOME });
        }
        throw notFound();
      }
      if (
        !(
          teacherInfoMayOpen(location.pathname) ||
          (teacher && lessonsMayOpen(location.pathname)) ||
          (translator && translatorMayOpen(location.pathname))
        )
      ) {
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
