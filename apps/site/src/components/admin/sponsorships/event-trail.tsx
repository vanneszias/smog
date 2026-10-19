import type { AdminSponsorshipDetail } from "@smog/admin/schema";
import type { Translate, TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import type {
  CANCEL_REASONS,
  RefundReason,
  SponsorshipEventType,
} from "@smog/sponsorships/schema";
import { Text } from "@smog/ui-web";
import type { ReactNode } from "react";
import { useAuditTime } from "../audit-data";
import { eventLabel, tokenPurposeLabel, useDay } from "./labels";

type SponsorshipEvent = AdminSponsorshipDetail["events"][number];
type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * Only an admin writes these: without an actor, the admin's account is
 * gone. Every other event without one is the system's (the webhook, the
 * jobs, the sponsor's own links).
 */
const ADMIN_EVENTS: ReadonlySet<SponsorshipEventType> = new Set([
  "approved",
  "changes_requested",
  "force_expired",
  "marked_paid_manually",
  "rejected",
]);

function actorKey(type: SponsorshipEventType): TranslationKey {
  if (type === "legacy") {
    return "admin.sponsorships.events.legacyActor";
  }
  return ADMIN_EVENTS.has(type)
    ? "admin.sponsorships.events.deletedActor"
    : "admin.sponsorships.events.system";
}

const CANCEL_REASON_KEYS = {
  admin: "admin.sponsorships.events.cancelReason.admin",
  mismatch: "admin.sponsorships.events.cancelReason.mismatch",
  provider: "admin.sponsorships.events.cancelReason.provider",
  stale: "admin.sponsorships.events.cancelReason.stale",
} as const satisfies Record<CancelReason, TranslationKey>;

const REFUND_REASON_KEYS = {
  chargeback: "admin.sponsorships.events.refundReason.chargeback",
  double: "admin.sponsorships.events.refundReason.double",
  late: "admin.sponsorships.events.refundReason.late",
  mismatch: "admin.sponsorships.events.refundReason.mismatch",
} as const satisfies Record<RefundReason, TranslationKey>;

function field(data: unknown, key: string): unknown {
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)[key]
    : undefined;
}

function stringField(data: unknown, key: string): string | null {
  const value = field(data, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isoMs(data: unknown, key: string): number | null {
  const value = stringField(data, key);
  const ms = value === null ? Number.NaN : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function pick(
  value: string | null,
  keys: Readonly<Record<string, TranslationKey>>,
  t: Translate
): string | null {
  const key = value === null ? undefined : keys[value];
  return key ? t(key) : null;
}

/**
 * The line under an event: the reason, the note, the error or the dates it
 * carries (`sponsorship_event.data`, validated per type on write). Ids and
 * token data stay out.
 */
function useEventDetail(): (event: SponsorshipEvent) => string | null {
  const { t } = useTranslation();
  const day = useDay();
  return (event) => {
    const { data } = event;
    switch (event.type) {
      case "rejected":
        return stringField(data, "reason");
      case "marked_paid_manually":
        return stringField(data, "note");
      case "render_failed":
        return stringField(data, "error");
      case "render_started": {
        // Which attempt, so a retried render (A-27) reads as such.
        const attempt = field(data, "attempt");
        return typeof attempt === "number"
          ? t("admin.sponsorships.renderJobs.attempt", { attempt })
          : null;
      }
      case "cancelled":
        return pick(stringField(data, "reason"), CANCEL_REASON_KEYS, t);
      case "refund_needed":
        return pick(stringField(data, "reason"), REFUND_REASON_KEYS, t);
      case "approved": {
        const start = isoMs(data, "startsAt");
        const end = isoMs(data, "endsAt");
        return start === null || end === null
          ? null
          : t("admin.sponsorships.events.period", {
              end: day(end),
              start: day(start),
            });
      }
      case "renewed":
      case "reminder_sent": {
        const end = isoMs(data, "endsAt");
        return end === null
          ? null
          : t("admin.sponsorships.events.until", { date: day(end) });
      }
      case "changes_requested": {
        const expires = isoMs(data, "expiresAt");
        return expires === null
          ? null
          : t("admin.sponsorships.events.linkUntil", { date: day(expires) });
      }
      case "token_issued": {
        const expires = isoMs(data, "expiresAt");
        const purpose = stringField(data, "purpose");
        if (
          expires === null ||
          (purpose !== "reedit" && purpose !== "renewal")
        ) {
          return null;
        }
        return `${tokenPurposeLabel(t, purpose)} · ${t(
          "admin.sponsorships.events.linkUntil",
          { date: day(expires) }
        )}`;
      }
      default:
        return null;
    }
  };
}

/**
 * The review trail (A-15, A-29), oldest first: what happened, when, by
 * whom ("System" for the webhook and the jobs, "Deleted account" once the
 * admin's account is gone), and its reason or note.
 */
export function EventTrail({
  events,
}: {
  events: readonly SponsorshipEvent[];
}): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const detailOf = useEventDetail();
  if (events.length === 0) {
    return <Text tone="muted">{t("admin.sponsorships.events.empty")}</Text>;
  }
  return (
    <ol
      aria-label={t("admin.sponsorships.events.title")}
      className="flex flex-col"
    >
      {events.map((event) => {
        const line = detailOf(event);
        return (
          <li
            className="relative flex flex-col gap-0.5 border-border-subtle border-l-2 py-2 pl-4"
            key={event.id}
          >
            <span className="font-medium text-body-sm">
              {eventLabel(t, event.type)}
            </span>
            {line ? (
              <span className="whitespace-pre-line break-words text-body-sm">
                {line}
              </span>
            ) : null}
            <Text as="span" size="caption" tone="muted">
              <time dateTime={new Date(event.createdAt).toISOString()}>
                {time(event.createdAt)}
              </time>
              {" · "}
              {event.actor ? event.actor.name : t(actorKey(event.type))}
            </Text>
          </li>
        );
      })}
    </ol>
  );
}
