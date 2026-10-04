import { useTranslation } from "@smog/i18n/react";
import { type WizardState, wizardPrice } from "@smog/sponsorships/client";
import { Button, Card, Heading, Text } from "@smog/ui-web";
import { formatMoney } from "@smog/utils";
import { ArrowLeft, Lock } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Turnstile } from "@/components/auth/turnstile";
import { usePageLocale } from "./page-locale";
import { type PreviewGesture, PreviewPicker } from "./preview-picker";
import { SponsorPreviewSlot } from "./preview-slot";

export interface StepReviewProps {
  /** The failed attempt's message, if any. */
  error: string | null;
  onBack: () => void;
  onPay: () => void;
  onToken: (token: string | null) => void;
  paying: boolean;
  state: WizardState;
  titleRef: (node: HTMLHeadingElement | null) => void;
  /** Changing it fetches a fresh Turnstile token (single use). */
  turnstileKey: number;
  /** `null` in dev (no widget, no token needed). */
  turnstileSiteKey: string | null;
  /** A token is in hand (or none is needed). */
  verified: boolean;
}

function Row({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="min-w-0 break-words sm:text-right">{value}</dd>
    </div>
  );
}

/**
 * One Player at a time (phase 7 ruling 8; up to 10 MP4s at once is too
 * heavy): the chosen gesture's preview, the first by default, above a row
 * of poster toggles when there is more than one.
 */
function ReviewPreview({
  displayName,
  gestures,
  logo,
}: {
  displayName: string;
  gestures: readonly PreviewGesture[];
  logo: Blob | null;
}): ReactNode {
  const [chosenId, setChosenId] = useState(gestures[0]?.id ?? "");
  const shown =
    gestures.find((gesture) => gesture.id === chosenId) ?? gestures[0];
  if (!shown) {
    return null;
  }
  return (
    <div className="flex flex-col gap-4">
      <SponsorPreviewSlot
        displayName={displayName}
        logo={logo}
        name={shown.name}
        playbackId={shown.playbackId}
      />
      {gestures.length > 1 ? (
        <PreviewPicker
          gestures={gestures}
          onSelect={setChosenId}
          selectedId={shown.id}
        />
      ) : null}
    </div>
  );
}

/**
 * Step 3, "Preview & pay" (S-11): the sponsored video's preview (ruling
 * 8), the summary (the gestures, 1 year, the name, the logo, the contact,
 * the total), Turnstile, and "Continue to payment" with the note that
 * Mollie takes over.
 */
export function StepReview({
  error,
  onBack,
  onPay,
  onToken,
  paying,
  state,
  titleRef,
  turnstileKey,
  turnstileSiteKey,
  verified,
}: StepReviewProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const { details } = state;
  const logo = details.includeLogo ? state.logo : null;
  const total = wizardPrice(state)?.totalCents ?? 0;
  const contact = [details.contactName, details.contactEmail, details.company]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Heading level={1} ref={titleRef} size="title-1" tabIndex={-1}>
          {t("sponsor.review.title")}
        </Heading>
        <Text className="max-w-reading" tone="muted">
          {t("sponsor.review.description")}
        </Text>
      </div>
      <ReviewPreview
        displayName={details.displayName.trim()}
        gestures={state.selected}
        logo={logo}
      />
      <Card className="max-w-reading gap-4" variant="sunken">
        <Heading level={2} size="title-3">
          {t("sponsor.review.summary")}
        </Heading>
        <dl className="flex flex-col gap-3 text-body-sm">
          <Row
            label={t("sponsor.review.gestures")}
            value={state.selected.map((gesture) => gesture.name).join(", ")}
          />
          <Row
            label={t("sponsor.review.duration")}
            value={t("sponsor.review.durationValue")}
          />
          <Row
            label={t("sponsor.review.nameInVideo")}
            value={details.displayName.trim()}
          />
          <Row
            label={t("sponsor.review.logo")}
            value={logo ? t("sponsor.review.yes") : t("sponsor.review.no")}
          />
          <Row label={t("sponsor.review.contact")} value={contact} />
          {details.wantsInvoice ? (
            <Row
              label={t("sponsor.review.invoice")}
              value={`${details.invoiceName.trim()} · ${details.vatNumber.trim()}`}
            />
          ) : null}
          <div className="flex justify-between gap-4 border-border-subtle border-t pt-3 font-semibold text-body">
            <dt>{t("sponsor.review.total")}</dt>
            <dd className="tabular-nums" data-testid="review-total">
              {formatMoney(total, locale)}
            </dd>
          </div>
        </dl>
      </Card>
      <div className="flex max-w-reading flex-col gap-4">
        {turnstileSiteKey ? (
          <Turnstile
            onToken={onToken}
            resetKey={turnstileKey}
            siteKey={turnstileSiteKey}
          />
        ) : null}
        {error ? (
          <Text role="alert" size="body-sm" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button
          className="self-start"
          disabled={!verified}
          icon={<Lock />}
          loading={paying}
          onClick={onPay}
          size="lg"
        >
          {t("sponsor.review.pay")}
        </Button>
        <Text size="body-sm" tone="muted">
          {verified
            ? t("sponsor.review.redirectNote")
            : t("sponsor.review.captchaHint")}
        </Text>
      </div>
      <div>
        <Button icon={<ArrowLeft />} onClick={onBack} variant="secondary">
          {t("sponsor.review.back")}
        </Button>
      </div>
    </div>
  );
}
