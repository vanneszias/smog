import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { orpc } from "@/utils/orpc";

const TOKEN_STORAGE_KEY = "smog_web_token";
const USER_STORAGE_KEY = "smog_web_user";

export const Route = createFileRoute("/admin")({
  component: RouteComponent,
  beforeLoad: async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const userStr = localStorage.getItem(USER_STORAGE_KEY);

    const hasAuth = token && userStr;

    if (!hasAuth) {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/admin",
        },
      });
    }

    // Verify admin access
    try {
      await orpc.admin.verifyAdmin.query();
    } catch (error) {
      console.error("Admin verification failed:", error);
      throw redirect({
        to: "/",
      });
    }

    const user = JSON.parse(userStr);
    return { user };
  },
});

function RouteComponent() {
  const { user } = Route.useRouteContext();

  return <AdminDashboard user={user} />;
}
