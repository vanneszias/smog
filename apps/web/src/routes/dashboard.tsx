import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { orpc } from "@/utils/orpc";

const TOKEN_STORAGE_KEY = "smog_web_token";
const USER_STORAGE_KEY = "smog_web_user";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const userStr = localStorage.getItem(USER_STORAGE_KEY);

    const hasAuth = token && userStr;

    if (!hasAuth) {
      throw redirect({
        to: "/login",
      });
    }

    const user = JSON.parse(userStr);
    return { user };
  },
});

function RouteComponent() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();

  const privateData = useQuery(orpc.privateData.queryOptions());

  const displayName = user.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user.email;

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
