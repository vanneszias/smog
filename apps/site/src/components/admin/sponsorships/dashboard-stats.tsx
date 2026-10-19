import type { Dashboard } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Card, CardContent, CardTitle, cn, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { HandCoins } from "lucide-react";
import type { ReactNode } from "react";
import type { SponsorshipTab } from "./search";

type Stats = Dashboard["sponsorships"];

/**
 * The dashboard's sponsorship card (A-03): how many wait for review, and
 * a link per stage to its tab. Payments that need a refund stand out.
 */
export function SponsorshipStats({ stats }: { stats: Stats }): ReactNode {
  const { t } = useTranslation();
  const lines: { label: string; tab: SponsorshipTab; urgent?: boolean }[] = [
    {
      label: t("admin.dashboard.sponsorships.awaitingPayment", {
        count: stats.awaitingPayment,
      }),
      tab: "awaiting",
    },
    {
      label: t("admin.dashboard.sponsorships.rendering", {
        count: stats.rendering,
      }),
      tab: "rendering",
    },
    {
      label: t("admin.dashboard.sponsorships.renderFailed", {
        count: stats.renderFailed,
      }),
      tab: "rendering",
      urgent: stats.renderFailed > 0,
    },
    {
      label: t("admin.dashboard.sponsorships.live", { count: stats.live }),
      tab: "live",
    },
    {
      label: t("admin.dashboard.sponsorships.expiring", {
        count: stats.expiring,
      }),
      tab: "live",
    },
    {
      label: t("admin.dashboard.sponsorships.refundNeeded", {
        count: stats.refundNeeded,
      }),
      tab: "refund",
      urgent: stats.refundNeeded > 0,
    },
  ];
  return (
    <Card className="gap-1 sm:p-4">
      <CardContent className="gap-1">
        <div className="flex items-center gap-2 text-foreground-muted [&_svg]:size-4">
          <span aria-hidden="true">
            <HandCoins />
          </span>
          <CardTitle className="font-medium text-body-sm" level={2}>
            {t("admin.dashboard.sponsorships.title")}
          </CardTitle>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="font-semibold text-foreground text-title-1 tabular-nums">
            {stats.inReview}
          </span>
          <TextLink asChild className="text-body-sm">
            <Link to="/admin/sponsorships">
              {t("admin.dashboard.sponsorships.inReview", {
                count: stats.inReview,
              })}
            </Link>
          </TextLink>
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {lines.map((line) => (
            <li key={line.label}>
              <TextLink
                asChild
                className={cn(
                  "text-body-sm",
                  line.urgent ? "text-danger-strong" : undefined
                )}
                tone={line.urgent ? "default" : "muted"}
              >
                <Link search={{ tab: line.tab }} to="/admin/sponsorships">
                  {line.label}
                </Link>
              </TextLink>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
