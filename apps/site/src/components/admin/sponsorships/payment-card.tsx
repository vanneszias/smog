import type { AdminPayment, AdminSponsorshipDetail } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Badge, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useAuditTime } from "../audit-data";
import { PaymentActions } from "./action-dialogs";
import {
  PAYMENT_STATUS_TONES,
  paymentKindLabel,
  paymentStatusLabel,
  useMoney,
} from "./labels";
import { StatusBadge } from "./status-badge";

function Fact({
  children,
  label,
}: {
  children: ReactNode;
  label: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt>
        <Text as="span" size="caption" tone="muted" weight="semibold">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0 break-words text-body-sm">{children}</dd>
    </div>
  );
}

/** The refund state: "Refunded" (in full), a part, or nothing yet. */
function RefundState({ payment }: { payment: AdminPayment }): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const time = useAuditTime();
  if (payment.refunded) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="success">
          {t("admin.sponsorships.payment.refunded")}
        </Badge>
        {payment.refundedAt === null ? null : (
          <Text as="span" size="caption" tone="muted">
            {time(payment.refundedAt)}
          </Text>
        )}
      </span>
    );
  }
  if (payment.refundedCents > 0) {
    return t("admin.sponsorships.payment.partlyRefunded", {
      amount: money(payment.refundedCents),
      total: money(payment.amountCents),
    });
  }
  return t("admin.sponsorships.payment.notRefunded");
}

export interface PaymentCardProps {
  /** The sponsorship whose detail this is (its own row is marked). */
  currentId: string;
  /** The sponsor's display name, for the action dialogs. */
  name: string;
  payment: AdminPayment;
  reload: () => Promise<AdminSponsorshipDetail | undefined>;
}

/**
 * One payment (A-10, A-11, ruling 4): its kind, status and amount, the
 * Mollie dashboard link, every gesture it covers, the refund and any
 * chargeback, and the actions that apply.
 */
export function PaymentCard({
  currentId,
  name,
  payment,
  reload,
}: PaymentCardProps): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const time = useAuditTime();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const needsRefund = payment.status === "refund_needed" && !payment.refunded;
  // A payment action that removes its own button (record refund, mark
  // paid, cancel) would drop the focus to <body>: it moves to this card's
  // heading instead (review M3).
  const state = `${payment.status}:${payment.refunded}`;
  const shownState = useRef(state);
  useEffect(() => {
    if (shownState.current === state) {
      return;
    }
    shownState.current = state;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [state]);
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className="font-semibold text-body outline-none"
          id={headingId}
          ref={heading}
          tabIndex={-1}
        >
          {t("admin.sponsorships.payment.title", {
            kind: paymentKindLabel(t, payment.kind),
          })}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={PAYMENT_STATUS_TONES[payment.status]}>
            {paymentStatusLabel(t, payment.status)}
          </Badge>
          <span className="font-semibold tabular-nums">
            {money(payment.amountCents)}
          </span>
        </div>
      </div>
      {needsRefund ? (
        <p className="flex items-start gap-2 rounded-md bg-danger-subtle p-2 text-body-sm text-danger-strong">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {payment.mollieId
            ? t("admin.sponsorships.payment.refundNeeded")
            : t("admin.sponsorships.payment.refundNeededNoMollie")}
        </p>
      ) : null}
      {payment.chargedBackCents > 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-subtle p-2 text-body-sm text-warning-strong">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            {t("admin.sponsorships.payment.chargedBack", {
              amount: money(payment.chargedBackCents),
              date:
                payment.chargedBackAt === null
                  ? "—"
                  : time(payment.chargedBackAt),
            })}{" "}
            {t("admin.sponsorships.payment.chargebackHint")}
          </span>
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label={t("admin.sponsorships.payment.created")}>
          {time(payment.createdAt)}
        </Fact>
        <Fact label={t("admin.sponsorships.payment.paid")}>
          {payment.paidAt === null ? "—" : time(payment.paidAt)}
        </Fact>
        <Fact label={t("admin.sponsorships.payment.refund")}>
          <RefundState payment={payment} />
        </Fact>
        <Fact label={t("admin.sponsorships.payment.mollieId")}>
          {payment.mollieId ? (
            <span className="font-mono">{payment.mollieId}</span>
          ) : (
            t("admin.sponsorships.payment.noMollie")
          )}
        </Fact>
      </dl>
      <div className="flex flex-col gap-1">
        <Text as="span" size="caption" tone="muted" weight="semibold">
          {t("admin.sponsorships.payment.gestures", {
            count: payment.items.length,
          })}
        </Text>
        <ul className="flex flex-col divide-y divide-border-subtle">
          {payment.items.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              key={item.sponsorshipId}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.sponsorshipId === currentId ? (
                  <span className="truncate font-medium text-body-sm">
                    {item.gesture.name}
                  </span>
                ) : (
                  <TextLink asChild className="truncate text-body-sm">
                    <Link
                      params={{ id: item.sponsorshipId }}
                      to="/admin/sponsorships/$id"
                    >
                      {item.gesture.name}
                    </Link>
                  </TextLink>
                )}
                <StatusBadge status={item.status} />
              </span>
              <span className="text-body-sm tabular-nums">
                {money(item.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {payment.mollieDashboardUrl ? (
          <TextLink
            className="inline-flex items-center gap-1 text-body-sm"
            href={payment.mollieDashboardUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("admin.sponsorships.payment.openInMollie")}
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only">
              {t("admin.sponsorships.payment.newTab")}
            </span>
          </TextLink>
        ) : (
          <span />
        )}
        <PaymentActions name={name} payment={payment} reload={reload} />
      </div>
    </section>
  );
}
