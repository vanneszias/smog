import { useAdminDashboard } from "@smog/admin/client";
import type { Dashboard } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  ErrorState,
  Heading,
  Skeleton,
  Text,
  TextLink,
} from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderTree, Hand, HandCoins, Plus, Users } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { AuditEntries } from "@/components/admin/audit-table";
import { SponsorshipStats } from "@/components/admin/sponsorships/dashboard-stats";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  head: ({ matches }) => pageMeta(matches, "admin.dashboard.title"),
});

function StatCard({
  details,
  icon,
  title,
  total,
}: {
  details: readonly string[];
  icon: ReactNode;
  title: string;
  total: number;
}): ReactNode {
  return (
    <Card className="gap-1 sm:p-4">
      <CardContent className="gap-1">
        <div className="flex items-center gap-2 text-foreground-muted [&_svg]:size-4">
          <span aria-hidden="true">{icon}</span>
          <CardTitle className="font-medium text-body-sm" level={2}>
            {title}
          </CardTitle>
        </div>
        <p className="font-semibold text-foreground text-title-1 tabular-nums">
          {total}
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {details.map((detail) => (
            <li key={detail}>
              <Text as="span" size="body-sm" tone="muted">
                {detail}
              </Text>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stats({ data }: { data: Dashboard }): ReactNode {
  const { t } = useTranslation();
  const { categories, gestures, users } = data;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SponsorshipStats stats={data.sponsorships} />
      <StatCard
        details={[
          t("admin.dashboard.published", { count: gestures.published }),
          t("admin.dashboard.unpublished", { count: gestures.unpublished }),
        ]}
        icon={<Hand />}
        title={t("admin.dashboard.gestures")}
        total={gestures.total}
      />
      <StatCard
        details={[
          t("admin.dashboard.published", { count: categories.published }),
          t("admin.dashboard.unpublished", {
            count: categories.total - categories.published,
          }),
        ]}
        icon={<FolderTree />}
        title={t("admin.dashboard.categories")}
        total={categories.total}
      />
      <StatCard
        details={[
          t("admin.dashboard.admins", { count: users.admins }),
          t("admin.dashboard.banned", { count: users.banned }),
          t("admin.dashboard.newUsers", { count: users.last30Days }),
        ]}
        icon={<Users />}
        title={t("admin.dashboard.users")}
        total={users.total}
      />
    </div>
  );
}

function RecentAudit({ data }: { data: Dashboard }): ReactNode {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="recent-audit" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading id="recent-audit" level={2}>
          {t("admin.dashboard.recentAudit")}
        </Heading>
        <TextLink asChild>
          <Link to="/admin/audit">{t("admin.dashboard.allAudit")}</Link>
        </TextLink>
      </div>
      {data.recentAudit.length === 0 ? (
        <Text tone="muted">{t("admin.dashboard.noAudit")}</Text>
      ) : (
        <AuditEntries
          entries={data.recentAudit}
          label={t("admin.dashboard.recentAudit")}
        />
      )}
    </section>
  );
}

/** `/admin` (A-03): counts, the newest audit entries and quick links. */
function AdminDashboard(): ReactNode {
  const { t } = useTranslation();
  const dashboard = useAdminDashboard();
  const { refetch } = dashboard;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the dashboard:", error);
    });
  }, [refetch]);
  let body: ReactNode;
  if (dashboard.data) {
    body = (
      <>
        <Stats data={dashboard.data} />
        <RecentAudit data={dashboard.data} />
      </>
    );
  } else if (dashboard.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </>
    );
  }
  return (
    <AdminPage
      actions={
        <nav
          aria-label={t("admin.dashboard.quickLinks")}
          className="flex flex-wrap gap-2"
        >
          <Button asChild icon={<HandCoins />}>
            <Link to="/admin/sponsorships">
              {t("admin.dashboard.sponsorships.review")}
            </Link>
          </Button>
          <Button asChild icon={<Plus />} variant="secondary">
            <Link to="/admin/gestures/new">
              {t("admin.dashboard.newGesture")}
            </Link>
          </Button>
          <Button asChild icon={<FolderTree />} variant="secondary">
            <Link to="/admin/categories">
              {t("admin.dashboard.manageCategories")}
            </Link>
          </Button>
        </nav>
      }
      description={t("admin.dashboard.description")}
      title={t("admin.dashboard.title")}
    >
      {body}
    </AdminPage>
  );
}
