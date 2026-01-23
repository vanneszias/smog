import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const privateData = useQuery(orpc.privateData.queryOptions());

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user?.email || "";

  return (
    <div>
      <h1>{t("web.dashboard.title")}</h1>
      <p>{t("web.dashboard.welcome", { name: displayName })}</p>
      <p>
        {t("web.dashboard.apiLabel")}
        {privateData.data?.message}
      </p>
    </div>
  );
}
