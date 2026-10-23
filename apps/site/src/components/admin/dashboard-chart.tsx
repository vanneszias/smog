import type { Dashboard } from "@smog/admin/schema";
import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Card, CardContent, CardDescription, CardTitle } from "@smog/ui-web";
import type { ReactNode } from "react";

interface Bar {
  /** A `bg-chart-*` fill. */
  fill: string;
  label: TranslationKey;
  value: number;
}

/** The bars of both groups: the sponsorship pipeline and the catalogue. */
function chartGroups(data: Dashboard): {
  bars: Bar[];
  title: TranslationKey;
}[] {
  const { gestures, sponsorships } = data;
  return [
    {
      bars: [
        {
          fill: "bg-chart-2",
          label: "admin.dashboard.chart.awaitingPayment",
          value: sponsorships.awaitingPayment,
        },
        {
          fill: "bg-chart-3",
          label: "admin.dashboard.chart.inReview",
          value: sponsorships.inReview,
        },
        {
          fill: "bg-chart-1",
          label: "admin.dashboard.chart.live",
          value: sponsorships.live,
        },
      ],
      title: "admin.dashboard.chart.sponsorships",
    },
    {
      bars: [
        {
          fill: "bg-chart-1",
          label: "admin.dashboard.chart.published",
          value: gestures.published,
        },
        {
          fill: "bg-chart-2",
          label: "admin.dashboard.chart.hidden",
          value: gestures.unpublished,
        },
      ],
      title: "admin.dashboard.chart.catalogue",
    },
  ];
}

/**
 * The dashboard chart (shadcn `chart` block, in plain markup: no charting
 * library in the admin chunk): horizontal bars with their numbers in the
 * text, so the figures never rely on colour. Loaded lazily by the dashboard.
 */
export default function DashboardChart({
  data,
}: {
  data: Dashboard;
}): ReactNode {
  const { t } = useTranslation();
  const groups = chartGroups(data);
  const max = Math.max(
    1,
    ...groups.flatMap((group) => group.bars.map((bar) => bar.value))
  );
  return (
    <Card className="sm:p-4" data-slot="dashboard-chart">
      <CardContent className="gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle level={2}>{t("admin.dashboard.chart.title")}</CardTitle>
          <CardDescription>
            {t("admin.dashboard.chart.description")}
          </CardDescription>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {groups.map((group) => (
            <figure className="flex flex-col gap-3" key={group.title}>
              <figcaption className="font-medium text-body-sm text-muted-foreground">
                {t(group.title)}
              </figcaption>
              <ul className="flex flex-col gap-3">
                {group.bars.map((bar) => (
                  <li className="flex flex-col gap-1" key={bar.label}>
                    <div className="flex items-baseline justify-between gap-2 text-body-sm">
                      <span>{t(bar.label)}</span>
                      <span className="font-semibold tabular-nums">
                        {bar.value}
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className={`h-full rounded-full ${bar.fill}`}
                        style={{ width: `${(bar.value / max) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </figure>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
