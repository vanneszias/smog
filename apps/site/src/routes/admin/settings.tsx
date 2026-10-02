import { useTranslation } from "@smog/i18n/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { BypassCard } from "@/components/admin/bypass-card";
import { MaintenanceCard } from "@/components/admin/maintenance-card";
import { pageMeta } from "@/lib/head";
import { requestBypassCookie } from "@/lib/maintenance-bypass";
import { getMaintenanceBypassStatus } from "@/server/maintenance.functions";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
  head: ({ matches }) => pageMeta(matches, "admin.settings.title"),
});

/** This browser's bypass cookie: about the browser, not the account. */
const BYPASS_STATUS_KEY = ["admin", "maintenance-bypass"] as const;

/**
 * `/admin/settings` (A-26, P-11): the maintenance toggle and this
 * browser's bypass cookie (ruling 9). Enabling gets the acting admin's
 * cookie first; disabling revokes every cookie.
 */
function AdminSettings(): ReactNode {
  const { t } = useTranslation();
  const bypassStatus = useQuery({
    queryFn: () => getMaintenanceBypassStatus(),
    queryKey: BYPASS_STATUS_KEY,
  });
  const { refetch } = bypassStatus;
  const refreshStatus = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the bypass status:", error);
    });
  }, [refetch]);
  const requestBypass = useCallback(async () => {
    try {
      return await requestBypassCookie();
    } finally {
      refreshStatus();
    }
  }, [refreshStatus]);
  return (
    <AdminPage
      description={t("admin.settings.description")}
      title={t("admin.settings.title")}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <MaintenanceCard
          onChanged={refreshStatus}
          requestBypass={requestBypass}
        />
        <BypassCard
          isError={bypassStatus.isError}
          onRetry={refreshStatus}
          requestBypass={requestBypass}
          status={bypassStatus.data}
        />
      </div>
    </AdminPage>
  );
}
