import { useAdminSponsorship } from "@smog/admin/client";
import type { AdminSponsorshipDetail } from "@smog/admin/schema";
import type { RenderJobStatus } from "@smog/db/enums";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  cn,
  EmptyState,
  ErrorState,
  Heading,
  Skeleton,
  Text,
  TextLink,
  VideoPlayer,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, SearchX, VideoOff } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { AdminPage } from "../admin-page";
import { useAuditTime } from "../audit-data";
import { errorCode } from "../catalog/errors";
import { SponsorshipActions, sponsorshipAmountCents } from "./action-dialogs";
import { EventTrail } from "./event-trail";
import { InvoiceBox } from "./invoice-box";
import { renderJobLabel, tokenPurposeLabel, useDay, useMoney } from "./labels";
import { PaymentCard } from "./payment-card";
import { StatusBadge } from "./status-badge";

function Section({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}): ReactNode {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <Heading id={id} level={2} size="title-3">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Fact({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}): ReactNode {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt>
        <Text as="span" size="caption" tone="muted" weight="semibold">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0 break-words text-body-sm">{children}</dd>
    </div>
  );
}

/**
 * The original and the sponsored video side by side, also on a phone (the
 * point is comparing them; stacked, two 3:4 players fill two screens).
 */
function Videos({ detail }: { detail: AdminSponsorshipDetail }): ReactNode {
  const { t } = useTranslation();
  const { gesture, video } = detail;
  return (
    <Section title={t("admin.sponsorships.detail.videos")}>
      <div className="grid max-w-3xl grid-cols-2 gap-3 sm:gap-4">
        <figure className="flex min-w-0 flex-col gap-2">
          <figcaption className="font-medium text-body-sm">
            {t("admin.sponsorships.detail.original")}
          </figcaption>
          <VideoPlayer
            playbackId={gesture.playbackId}
            title={t("admin.sponsorships.detail.originalOf", {
              name: gesture.name,
            })}
          />
        </figure>
        <figure className="flex min-w-0 flex-col gap-2">
          <figcaption className="flex flex-wrap items-center gap-2 font-medium text-body-sm">
            {t("admin.sponsorships.detail.sponsored")}
            {video.fakeRender ? (
              <Badge variant="warning">
                {t("admin.sponsorships.detail.fakeRender")}
              </Badge>
            ) : null}
          </figcaption>
          {video.playbackId ? (
            <VideoPlayer
              playbackId={video.playbackId}
              title={t("admin.sponsorships.detail.sponsoredOf", {
                name: gesture.name,
              })}
            />
          ) : (
            <div className="flex aspect-3/4 w-full flex-col items-center justify-center gap-2 rounded-lg bg-surface-sunken p-4 text-center text-foreground-muted">
              <VideoOff aria-hidden="true" className="size-6" />
              <Text as="span" size="body-sm" tone="muted">
                {t("admin.sponsorships.detail.noVideo")}
              </Text>
            </div>
          )}
        </figure>
      </div>
    </Section>
  );
}

/** The logo (an admin read of the private R2 object, ruling 10). */
function Logo({ detail }: { detail: AdminSponsorshipDetail }): ReactNode {
  const { t } = useTranslation();
  const { logoUrl, sponsorship } = detail;
  let body: ReactNode;
  if (logoUrl) {
    body = (
      <div className="flex items-center justify-center rounded-lg border border-border-subtle bg-surface-sunken p-3">
        <img
          alt={t("admin.sponsorships.logo.alt", {
            name: sponsorship.displayName,
          })}
          className="h-auto max-h-40 w-auto max-w-full object-contain"
          height={160}
          src={logoUrl}
          width={320}
        />
      </div>
    );
  } else {
    body = (
      <Text size="body-sm" tone="muted">
        {t(
          sponsorship.hasLogo
            ? "admin.sponsorships.logo.removed"
            : "admin.sponsorships.logo.none"
        )}
      </Text>
    );
  }
  return <Section title={t("admin.sponsorships.logo.title")}>{body}</Section>;
}

function Facts({ detail }: { detail: AdminSponsorshipDetail }): ReactNode {
  const { t } = useTranslation();
  const day = useDay();
  const time = useAuditTime();
  const money = useMoney();
  const { gesture, sponsor, sponsorship } = detail;
  const cents = sponsorshipAmountCents(detail);
  return (
    <Section title={t("admin.sponsorships.detail.facts")}>
      <dl className="grid grid-cols-2 gap-3">
        <Fact label={t("admin.sponsorships.detail.gesture")}>
          <TextLink asChild>
            <Link params={{ id: gesture.id }} to="/admin/gestures/$id">
              {gesture.name}
            </Link>
          </TextLink>
        </Fact>
        <Fact label={t("admin.sponsorships.detail.amount")}>
          <span className="tabular-nums">
            {cents === null ? "—" : money(cents)}
          </span>
        </Fact>
        <Fact
          className="col-span-2"
          label={t("admin.sponsorships.detail.displayName")}
        >
          {sponsorship.displayName}
        </Fact>
        <Fact label={t("admin.sponsorships.detail.contact")}>
          {sponsor.name}
        </Fact>
        <Fact label={t("admin.sponsorships.detail.company")}>
          {sponsor.company ?? "—"}
        </Fact>
        <Fact
          className="col-span-2"
          label={t("admin.sponsorships.detail.email")}
        >
          <TextLink href={`mailto:${sponsor.email}`}>{sponsor.email}</TextLink>
        </Fact>
        <Fact label={t("admin.sponsorships.detail.language")}>
          {sponsor.locale.toUpperCase()}
        </Fact>
        <Fact label={t("admin.sponsorships.detail.created")}>
          {time(sponsorship.createdAt)}
        </Fact>
        <Fact label={t("admin.sponsorships.detail.startsAt")}>
          {sponsorship.startsAt === null ? "—" : day(sponsorship.startsAt)}
        </Fact>
        <Fact label={t("admin.sponsorships.detail.endsAt")}>
          {sponsorship.endsAt === null ? "—" : day(sponsorship.endsAt)}
        </Fact>
        {sponsorship.reminderSentAt === null ? null : (
          <Fact
            className="col-span-2"
            label={t("admin.sponsorships.detail.reminderSent")}
          >
            {time(sponsorship.reminderSentAt)}
          </Fact>
        )}
      </dl>
    </Section>
  );
}

/** The re-edit and renewal links' state (never a token or its hash). */
function Tokens({ detail }: { detail: AdminSponsorshipDetail }): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const now = Date.now();
  return (
    <Section title={t("admin.sponsorships.tokens.title")}>
      {detail.tokens.length === 0 ? (
        <Text size="body-sm" tone="muted">
          {t("admin.sponsorships.tokens.empty")}
        </Text>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {detail.tokens.map((token) => {
            let state: ReactNode;
            if (token.usedAt !== null) {
              state = <Badge>{t("admin.sponsorships.tokens.used")}</Badge>;
            } else if (token.expiresAt <= now) {
              state = <Badge>{t("admin.sponsorships.tokens.expired")}</Badge>;
            } else {
              state = (
                <Badge variant="success">
                  {t("admin.sponsorships.tokens.active")}
                </Badge>
              );
            }
            return (
              <li className="flex flex-col gap-1 py-2" key={token.id}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-body-sm">
                    {tokenPurposeLabel(t, token.purpose)}
                  </span>
                  {state}
                </span>
                <Text as="span" size="caption" tone="muted">
                  {t("admin.sponsorships.tokens.dates", {
                    created: time(token.createdAt),
                    expires: time(token.expiresAt),
                  })}
                </Text>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const RENDER_JOB_TONES = {
  failed: "danger",
  queued: "neutral",
  running: "neutral",
  succeeded: "success",
} as const satisfies Record<RenderJobStatus, "danger" | "neutral" | "success">;

/** The render jobs, read only (retrying arrives with phase 7, A-27). */
function RenderJobs({ detail }: { detail: AdminSponsorshipDetail }): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  return (
    <Section title={t("admin.sponsorships.renderJobs.title")}>
      <Text size="caption" tone="muted">
        {t("admin.sponsorships.renderJobs.retryLater")}
      </Text>
      {detail.renderJobs.length === 0 ? (
        <Text size="body-sm" tone="muted">
          {t("admin.sponsorships.renderJobs.empty")}
        </Text>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {detail.renderJobs.map((job) => (
            <li className="flex flex-col gap-1 py-2" key={job.id}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-body-sm">
                  {t("admin.sponsorships.renderJobs.attempt", {
                    attempt: job.attempt,
                  })}
                </span>
                <Badge variant={RENDER_JOB_TONES[job.status]}>
                  {renderJobLabel(t, job.status)}
                </Badge>
              </span>
              <Text as="span" size="caption" tone="muted">
                {job.finishedAt === null
                  ? time(job.createdAt)
                  : `${time(job.createdAt)} – ${time(job.finishedAt)}`}
              </Text>
              {job.error ? (
                <span className="break-words text-body-sm text-danger-strong">
                  {job.error}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function BackLink(): ReactNode {
  const { t } = useTranslation();
  return (
    <Button asChild icon={<ArrowLeft />} variant="ghost">
      <Link to="/admin/sponsorships">
        {t("admin.sponsorships.detail.back")}
      </Link>
    </Button>
  );
}

function DetailView({
  detail,
  reload,
}: {
  detail: AdminSponsorshipDetail;
  reload: () => Promise<AdminSponsorshipDetail | undefined>;
}): ReactNode {
  const { t } = useTranslation();
  const day = useDay();
  const title = useRef<HTMLSpanElement>(null);
  const { gesture, sponsorship } = detail;
  const { status } = sponsorship;
  // An action that changes the status removes its own button: the focus
  // would fall to <body>, so it moves to the title instead.
  const shownStatus = useRef(status);
  useEffect(() => {
    if (shownStatus.current === status) {
      return;
    }
    shownStatus.current = status;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      title.current?.focus({ preventScroll: true });
    }
  }, [status]);

  return (
    <AdminPage
      actions={<BackLink />}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={status} />
          <span>
            {t("admin.sponsorships.detail.subtitle", {
              date: day(sponsorship.createdAt),
              gesture: gesture.name,
            })}
          </span>
          <TextLink
            asChild
            className="inline-flex items-center gap-1"
            tone="muted"
          >
            <Link params={{ slug: gesture.slug }} to="/gestures/$slug">
              {t("admin.sponsorships.detail.publicPage")}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
          </TextLink>
        </span>
      }
      title={
        <span className="outline-none" ref={title} tabIndex={-1}>
          {sponsorship.displayName}
        </span>
      }
    >
      <SponsorshipActions detail={detail} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Videos detail={detail} />
          <Section title={t("admin.sponsorships.payment.section")}>
            {detail.payments.length === 0 ? (
              <Text size="body-sm" tone="muted">
                {t("admin.sponsorships.payment.empty")}
              </Text>
            ) : (
              detail.payments.map((payment) => (
                <PaymentCard
                  currentId={sponsorship.id}
                  key={payment.id}
                  name={sponsorship.displayName}
                  payment={payment}
                  reload={reload}
                />
              ))
            )}
          </Section>
          <Section title={t("admin.sponsorships.events.title")}>
            <EventTrail events={detail.events} />
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Facts detail={detail} />
          <InvoiceBox invoice={detail.invoice} />
          <Logo detail={detail} />
          <Tokens detail={detail} />
          <RenderJobs detail={detail} />
        </div>
      </div>
    </AdminPage>
  );
}

/**
 * `/admin/sponsorships/$id` (A-15, A-29): the videos, the sponsor, the
 * invoice box, the payments with their actions, the trail, the render jobs
 * and the links, with the moderation actions for its status.
 */
export function SponsorshipDetail({ id }: { id: string }): ReactNode {
  const { t } = useTranslation();
  const detail = useAdminSponsorship(id);
  const { refetch } = detail;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the sponsorship:", error);
    });
  }, [refetch]);
  const reload = useCallback(async () => (await refetch()).data, [refetch]);

  if (detail.data) {
    return <DetailView detail={detail.data} reload={reload} />;
  }
  let body: ReactNode;
  if (detail.isError && errorCode(detail.error) === "NOT_FOUND") {
    body = (
      <EmptyState
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/sponsorships">
              {t("admin.sponsorships.detail.back")}
            </Link>
          </Button>
        }
        description={t("admin.sponsorships.detail.notFoundDescription")}
        icon={<SearchX />}
        level={2}
        title={t("admin.sponsorships.detail.notFound")}
      />
    );
  } else if (detail.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <AdminPage title={t("admin.sponsorships.title")}>{body}</AdminPage>;
}
