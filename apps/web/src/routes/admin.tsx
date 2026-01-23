import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { useAuth } from "@/lib/auth";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/admin")({
  component: RouteComponent,
  beforeLoad: async () => {
    // Verify admin access
    try {
      await client.admin.verifyAdmin();
    } catch (error) {
      console.error("Admin verification failed:", error);
      throw redirect({
        to: "/",
      });
    }
  },
});

function RouteComponent() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <AdminDashboard user={user} />;
}
