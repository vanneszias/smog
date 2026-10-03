import { formatDate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { sponsorshipError, usePaymentStatus } from "@smog/sponsorships/client";
import type { PaymentStatusView } from "@smog/sponsorships/schema";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  ProgressBar,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { formatMoney } from "@smog/utils";
import { Link } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, CircleX, Clock } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { usePageLocale } from "./page-locale";
import { StatusTimeline } from "./status-timeline";

/** The title of a final, unpaid payment. */
const UNPAID_TITLE_KEYS = {
  canceled: "sponsor.success.canceled.title",
  expired: "sponsor.success.expired.title",
  failed: "sponsor.success.failed.title",
} as const;

function Summary({ view }: { view: PaymentStatusView }): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const rows = [
    {
      label: t("sponsor.success.summary.gestures"),
      value: view.items.map((item) => item.gestureName).join(", "),
    },
    { label: t("sponsor.success.summary.sponsor"), value: view.displayName },
    {
      label: t("sponsor.success.summary.duration"),
      value: t("sponsor.review.durationValue"),
    },
    {
      label:
        view.status === "paid"
          ? t("sponsor.success.summary.total")
          : t("sponsor.success.summary.amount"),
      value: formatMoney(view.totalCents, locale),
    },
  ];
  return (
    <Card className="gap-3" variant="sunken">
      <Heading level={2} size="title-3">
        {t("sponsor.success.summary.title")}
      </Heading>
      <dl className="flex flex-col gap-2 text-body-sm">
        {rows.map((row) => (
          <div
            className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"
            key={row.label}
          >
            <dt className="text-foreground-muted">{row.label}</dt>
            <dd className="min-w-0 break-words tabular-nums sm:text-right">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** The page's headline: an icon, the h1 and a line under it. */
interface Headline {
  description?: ReactNode;
  /** A final outcome: its h1 takes focus when it arrives (review I-4). */
  final: boolean;
  icon: ReactNode;
  title: string;
}

/**
 * The one live region of the page (review I-4): it is always rendered and
 * holds the current headline, so a screen reader hears "processing", then
 * the outcome, never the per-attempt counter. A final outcome also moves
 * the focus to its h1.
 */
function LiveHeadline({
  description,
  final,
  icon,
  title,
}: Headline): ReactNode {
  const heading = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new title is a new outcome to focus.
  useEffect(() => {
    if (final) {
      heading.current?.focus();
    }
  }, [final, title]);
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="flex flex-col items-center gap-3 text-center"
      data-testid="payment-status-live"
      role="status"
    >
      <span aria-hidden="true" className="*:size-12">
        {icon}
      </span>
      <Heading className="outline-none" level={1} ref={heading} tabIndex={-1}>
        {title}
      </Heading>
      {description ? (
        <Text className="max-w-reading" tone="muted">
          {description}
        </Text>
      ) : null}
    </div>
  );
}

function HomeLink(): ReactNode {
  const { t } = useTranslation();
  return (
    <Button asChild className="self-center" variant="secondary">
      <Link to="/">{t("sponsor.success.home")}</Link>
    </Button>
  );
}

export interface PaymentResultProps {
  /** Test seams for the poll's pace (2 s, 15 times by default). */
  intervalMs?: number;
  maxAttempts?: number;
  /** `?payment=` (our id or `tr_…`), or `null` when missing or malformed. */
  payment: string | null;
}

/**
 * `/sponsor/success` (S-14): polls `sponsorships.paymentStatus` while the
 * payment is open, then shows paid (the summary and the timeline), a paid
 * renewal, failed / canceled / expired (Try again, the selection kept as
 * `?gesture=`), or `refund_needed` ("we will contact you").
 */
export function PaymentResult({
  intervalMs,
  maxAttempts,
  payment,
}: PaymentResultProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const status = usePaymentStatus(payment, {
    ...(intervalMs === undefined ? {} : { intervalMs }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  });
  const view = status.data;

  const missing =
    payment === null || sponsorshipError(status.error)?.code === "NOT_FOUND";
  if (missing) {
    return (
      <EmptyState
        action={<HomeLink />}
        description={t("sponsor.success.missing.description")}
        level={1}
        title={t("sponsor.success.missing.title")}
      />
    );
  }
  if (status.isError && !view) {
    return (
      <ErrorState
        level={1}
        onRetry={status.checkAgain}
        retrying={status.isFetching}
      />
    );
  }

  let headline: Headline;
  let extra: ReactNode = null;
  if (!view) {
    headline = {
      final: false,
      icon: <Skeleton className="size-12 rounded-full" />,
      title: t("sponsor.success.loading"),
    };
  } else if (view.status === "open" && status.timedOut) {
    headline = {
      description: t("sponsor.success.timeout.description"),
      final: true,
      icon: <Clock className="text-warning-strong" />,
      title: t("sponsor.success.timeout.title"),
    };
    extra = (
      <Button
        className="self-center"
        loading={status.isFetching}
        onClick={status.checkAgain}
      >
        {t("sponsor.success.timeout.checkAgain")}
      </Button>
    );
  } else if (view.status === "open") {
    headline = {
      description: t("sponsor.success.open.description"),
      final: false,
      icon: <Clock className="text-primary-strong" />,
      title: t("sponsor.success.open.title"),
    };
    // Not live: "attempt n of 15" every 2 s would drown the outcome.
    extra = (
      <div className="flex flex-col gap-2">
        <ProgressBar
          label={t("sponsor.success.open.title")}
          max={status.maxAttempts}
          value={status.attempt}
        />
        <Text className="text-center" size="body-sm" tone="muted">
          {t("sponsor.success.open.attempt", {
            current: Math.max(1, status.attempt),
            max: status.maxAttempts,
          })}
        </Text>
      </div>
    );
  } else if (view.status === "paid" && view.kind === "renewal") {
    headline = {
      description:
        view.renewedUntil === undefined
          ? undefined
          : t("sponsor.success.renewed.description", {
              date: formatDate(view.renewedUntil, locale),
            }),
      final: true,
      icon: <CircleCheck className="text-success-strong" />,
      title: t("sponsor.success.renewed.title"),
    };
  } else if (view.status === "paid") {
    headline = {
      description: t("sponsor.success.paid.description"),
      final: true,
      icon: <CircleCheck className="text-success-strong" />,
      title: t("sponsor.success.paid.title"),
    };
    extra = <StatusTimeline />;
  } else if (view.status === "refund_needed") {
    headline = {
      description: t("sponsor.success.refund.description"),
      final: true,
      icon: <CircleAlert className="text-warning-strong" />,
      title: t("sponsor.success.refund.title"),
    };
  } else {
    const slugs = view.items.map((item) => item.gestureSlug).join(",");
    headline = {
      description: t("sponsor.success.failed.description"),
      final: true,
      icon: <CircleX className="text-danger-strong" />,
      title: t(UNPAID_TITLE_KEYS[view.status]),
    };
    extra =
      view.kind === "initial" ? (
        <Button asChild className="self-center">
          <Link search={{ gesture: slugs }} to="/sponsor">
            {t("sponsor.success.retry")}
          </Link>
        </Button>
      ) : null;
  }
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-6">
      <LiveHeadline {...headline} />
      {extra}
      {view ? <Summary view={view} /> : null}
      <HomeLink />
    </div>
  );
}
