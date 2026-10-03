import type { GestureDetail } from "@smog/gestures/schema";
import { formatDate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useSponsorCta } from "@smog/sponsorships/client";
import { Button, Card, Heading, Text } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { HandHeart } from "lucide-react";
import type { ReactNode } from "react";
import { usePageLocale } from "./page-locale";

export interface SponsorCtaProps {
  gesture: Pick<GestureDetail, "id" | "slug" | "sponsor">;
  /** The card title's heading level (the page's section level). */
  level: 2 | 3;
}

/**
 * The gesture's sponsor card (L-17): "Sponsor this gesture" with a link to
 * the wizard (`/sponsor?gesture=<slug>`), "being sponsored", or "Sponsored
 * by {name}" with the date it is free again. It replaces the credit line.
 */
export function SponsorCta({ gesture, level }: SponsorCtaProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const view = useSponsorCta(gesture);
  if (!view) {
    return null;
  }
  let title: string;
  let body: ReactNode;
  if (view.kind === "available") {
    title = t("gesture.sponsorCta.available.title");
    body = (
      <>
        <Text tone="muted">
          {t("gesture.sponsorCta.available.description")}
        </Text>
        <Button asChild className="self-start">
          <Link search={{ gesture: gesture.slug }} to="/sponsor">
            {t("gesture.sponsorCta.available.action")}
          </Link>
        </Button>
      </>
    );
  } else if (view.kind === "pending") {
    title = t("gesture.sponsorCta.pending.title");
    body = (
      <Text tone="muted">{t("gesture.sponsorCta.pending.description")}</Text>
    );
  } else {
    title = t("gesture.sponsorCta.sponsored.title");
    body = (
      <>
        <Text>
          {t("gesture.sponsorCta.sponsored.description", { name: view.name })}
        </Text>
        {view.endsAt === null ? null : (
          <Text size="body-sm" tone="muted">
            {t("gesture.sponsorCta.sponsored.availableFrom", {
              date: formatDate(view.endsAt, locale),
            })}
          </Text>
        )}
      </>
    );
  }
  return (
    <Card
      className="max-w-reading flex-row items-start gap-4"
      data-testid="sponsor-cta"
      variant="sunken"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-strong"
      >
        <HandHeart className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <Heading level={level} size="title-3">
          {title}
        </Heading>
        {body}
      </div>
    </Card>
  );
}
