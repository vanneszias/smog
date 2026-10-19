import type { AdminSponsorshipRow } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Badge, cn, EmptyState, Text } from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import { Link } from "@tanstack/react-router";
import { FileText, ImageIcon, PartyPopper } from "lucide-react";
import type { ReactNode } from "react";
import { useDay, useMoney } from "./labels";

const THUMB_WIDTH = 360;

/** One sponsorship waiting for review: the still, the gesture, the name. */
function QueueCard({ row }: { row: AdminSponsorshipRow }): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const day = useDay();
  return (
    <li className="min-w-0">
      <Link
        className={cn(
          "group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface text-foreground",
          "hover:shadow-1 dark:hover:border-border dark:hover:bg-surface-raised",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        )}
        params={{ id: row.id }}
        to="/admin/sponsorships/$id"
      >
        <img
          alt=""
          className="aspect-video w-full bg-surface-sunken object-cover"
          height={Math.round((THUMB_WIDTH * 9) / 16)}
          loading="lazy"
          src={muxThumbnailUrl(row.playbackId, { width: THUMB_WIDTH })}
          width={THUMB_WIDTH}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <h2 className="truncate font-semibold text-body">
              {row.gesture.name}
            </h2>
            {row.amountCents === null ? null : (
              <span className="shrink-0 font-medium text-body-sm tabular-nums">
                {money(row.amountCents)}
              </span>
            )}
          </div>
          <Text as="span" className="truncate" size="body-sm">
            {row.displayName}
          </Text>
          <Text as="span" className="truncate" size="caption" tone="muted">
            {row.sponsor.email}
          </Text>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            <Badge
              icon={<FileText />}
              variant={row.invoiceRequested ? "warning" : "neutral"}
            >
              {t(
                row.invoiceRequested
                  ? "admin.sponsorships.invoice.requested"
                  : "admin.sponsorships.invoice.none"
              )}
            </Badge>
            {row.hasLogo ? (
              <Badge icon={<ImageIcon />}>
                {t("admin.sponsorships.logo.has")}
              </Badge>
            ) : null}
            <Text
              as="span"
              className="ml-auto tabular-nums"
              size="caption"
              tone="muted"
            >
              <time dateTime={new Date(row.createdAt).toISOString()}>
                {day(row.createdAt)}
              </time>
            </Text>
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * The Review tab (A-04): a card per sponsorship in review, each opening its
 * detail. Empty, it is all caught up.
 */
export function ModerationQueue({
  rows,
}: {
  rows: readonly AdminSponsorshipRow[];
}): ReactNode {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <EmptyState
        description={t("admin.sponsorships.queue.emptyDescription")}
        icon={<PartyPopper />}
        level={2}
        title={t("admin.sponsorships.queue.empty")}
      />
    );
  }
  return (
    <ul
      aria-label={t("admin.sponsorships.queue.label")}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
    >
      {rows.map((row) => (
        <QueueCard key={row.id} row={row} />
      ))}
    </ul>
  );
}
