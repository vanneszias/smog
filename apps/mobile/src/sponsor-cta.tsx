import type { GestureDetail } from "@smog/gestures/schema";
import { DEFAULT_LOCALE, formatDate, isLocale } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useAvailability } from "@smog/sponsorships/client";
import { Button, Card, Heading, Text } from "@smog/ui-native";
import { type ReactElement, useCallback } from "react";
import { Linking, Platform } from "react-native";
import { SPONSOR_LINK_IN_APP } from "@/config";
import { sponsorUrl } from "@/lib/site";

/** Whether "Sponsor now" may show (App Store guideline 3.1.1, ruling 13). */
export function sponsorLinkShown(
  platform: typeof Platform.OS,
  linkInApp: boolean
): boolean {
  return platform !== "ios" || linkInApp;
}

type CtaView =
  | { kind: "available" }
  | { kind: "pending" }
  | { endsAt: number | null; kind: "sponsored"; name: string };

function useCtaView(
  gesture: SponsorCtaProps["gesture"],
  linkShown: boolean
): CtaView | null {
  const availability = useAvailability([gesture.id]);
  const item = availability.data?.items.find(
    (entry) => entry.gestureId === gesture.id
  );
  if (!(availability.data && item)) {
    // Loading or failed: the detail's own credit stands, nothing blocks.
    return gesture.sponsor
      ? {
          endsAt: gesture.sponsor.until,
          kind: "sponsored",
          name: gesture.sponsor.name,
        }
      : null;
  }
  switch (item.state) {
    case "available":
      return availability.data.checkoutEnabled && linkShown
        ? { kind: "available" }
        : null;
    case "pending":
      return { kind: "pending" };
    case "sponsored":
      return {
        endsAt: item.endsAt ?? null,
        kind: "sponsored",
        name: item.sponsorName ?? gesture.sponsor?.name ?? "",
      };
    default:
      return null;
  }
}

export interface SponsorCtaProps {
  gesture: Pick<GestureDetail, "id" | "slug" | "sponsor">;
  /** `SPONSOR_LINK_IN_APP` (a prop for the tests). */
  linkInApp?: boolean;
  platform?: typeof Platform.OS;
}

/**
 * The gesture's sponsor card (L-17), as on the site, from
 * `sponsorships.availability`: "Sponsor this gesture" opens the site's
 * wizard in the system browser, "being sponsored", or "Sponsored by
 * {name}" with the date it is free again. It hides itself on an
 * availability error, and on iOS when `SPONSOR_LINK_IN_APP` is off.
 */
export function SponsorCta({
  gesture,
  linkInApp = SPONSOR_LINK_IN_APP,
  platform = Platform.OS,
}: SponsorCtaProps): ReactElement | null {
  const { i18n, t } = useTranslation();
  const linkShown = sponsorLinkShown(platform, linkInApp);
  const view = useCtaView(gesture, linkShown);
  const { slug } = gesture;
  const open = useCallback(() => {
    Linking.openURL(sponsorUrl(slug)).catch((error: unknown) => {
      console.error("[sponsorCta] Failed to open the wizard:", error);
    });
  }, [slug]);
  if (!view) {
    return null;
  }
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  let title: string;
  let body: ReactElement;
  if (view.kind === "available") {
    title = t("gesture.sponsorCta.available.title");
    body = (
      <>
        <Text tone="muted">
          {t("gesture.sponsorCta.available.description")}
        </Text>
        <Button className="self-start" onPress={open}>
          {t("gesture.sponsorCta.available.action")}
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
        {/* Without the link on iOS, no pointer to a later purchase either. */}
        {view.endsAt === null || !linkShown ? null : (
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
    <Card testID="sponsor-cta" variant="sunken">
      <Heading level={2} size="title-3">
        {title}
      </Heading>
      {body}
    </Card>
  );
}
