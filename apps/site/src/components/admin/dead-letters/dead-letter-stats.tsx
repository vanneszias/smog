import type { Dashboard } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Card, CardContent, CardTitle, cn, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { MailWarning } from "lucide-react";
import type { ReactNode } from "react";
import { useAuditTime } from "../audit-data";

/**
 * The dashboard's dead-letter card (phase 9 task 4): the messages nobody
 * replayed or discarded, per queue, the oldest one's date, and the
 * sponsorships whose render failed (the same count the sponsorship card
 * shows, here beside the alert that matters for it). Anything waiting
 * stands out.
 */
export function DeadLetterStats({
  renderFailed,
  stats,
}: {
  renderFailed: number;
  stats: Dashboard["deadLetters"];
}): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const total = stats.email + stats.events;
  return (
    <Card className="gap-1 sm:p-4">
      <CardContent className="gap-1">
        <div className="flex items-center gap-2 text-foreground-muted [&_svg]:size-4">
          <span aria-hidden="true">
            <MailWarning />
          </span>
          <CardTitle className="font-medium text-body-sm" level={2}>
            {t("admin.dashboard.deadLetters.title")}
          </CardTitle>
        </div>
        <p
          className={cn(
            "font-semibold text-title-1 tabular-nums",
            total > 0 ? "text-danger-strong" : "text-foreground"
          )}
        >
          {total}
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          <li>
            <TextLink asChild className="text-body-sm" tone="muted">
              <Link search={{ queue: "email" }} to="/admin/dead-letters">
                {t("admin.dashboard.deadLetters.email", { count: stats.email })}
              </Link>
            </TextLink>
          </li>
          <li>
            <TextLink asChild className="text-body-sm" tone="muted">
              <Link search={{ queue: "events" }} to="/admin/dead-letters">
                {t("admin.dashboard.deadLetters.events", {
                  count: stats.events,
                })}
              </Link>
            </TextLink>
          </li>
          <li>
            <TextLink
              asChild
              className={cn(
                "text-body-sm",
                renderFailed > 0 ? "text-danger-strong" : undefined
              )}
              tone={renderFailed > 0 ? "default" : "muted"}
            >
              <Link search={{ tab: "rendering" }} to="/admin/sponsorships">
                {t("admin.dashboard.deadLetters.renderFailed", {
                  count: renderFailed,
                })}
              </Link>
            </TextLink>
          </li>
        </ul>
        <Text size="body-sm" tone="muted">
          {stats.oldestReceivedAt === null
            ? t("admin.dashboard.deadLetters.none")
            : t("admin.dashboard.deadLetters.oldest", {
                date: time(stats.oldestReceivedAt),
              })}
        </Text>
      </CardContent>
    </Card>
  );
}
