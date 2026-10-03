import { SPONSORSHIP_DURATION_DAYS } from "@smog/config/constants";
import { formatDate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useRenewal, useRenewalCheckout } from "@smog/sponsorships/client";
import { Button, Card, Heading, Text } from "@smog/ui-web";
import { DAY_MS, formatMoney } from "@smog/utils";
import { Lock } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Turnstile } from "@/components/auth/turnstile";
import { mutationErrorMessage } from "./errors";
import { LinkState } from "./link-state";
import { usePageLocale } from "./page-locale";

function sendToMollie(checkoutUrl: string): void {
  window.location.assign(checkoutUrl);
}

export interface RenewalViewProps {
  redirect?: (checkoutUrl: string) => void;
  token: string | null;
  turnstileSiteKey: string | null;
}

/**
 * `/sponsor/renew?token=` (S-20): the link's guards, then the summary (the
 * gesture, the name, the current end → the new end, the amount from
 * `priceSponsorship` on the server), Turnstile and pay. Mollie returns to
 * the wizard's success page.
 */
export function RenewalView({
  redirect = sendToMollie,
  token,
  turnstileSiteKey,
}: RenewalViewProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const link = useRenewal(token);
  const checkout = useRenewalCheckout({ onRedirect: redirect });
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const retry = useCallback(() => {
    link.refetch().catch(() => undefined);
  }, [link]);
  const pay = useCallback(() => {
    if (token === null) {
      return;
    }
    checkout.mutate(
      { token, turnstileToken: captcha },
      {
        onError: () => {
          setCaptcha(null);
          setCaptchaKey((key) => key + 1);
        },
      }
    );
  }, [captcha, checkout, token]);

  if (token === null || !link.data) {
    return (
      <LinkState
        error={link.error}
        isFetching={link.isFetching}
        pending={link.isPending}
        retry={retry}
        token={token}
      />
    );
  }
  const view = link.data;
  // The server adds the same year to the stored end (ruling 6).
  const newEnd = view.endsAt + SPONSORSHIP_DURATION_DAYS * DAY_MS;
  const rows = [
    { label: t("sponsor.renew.gesture"), value: view.gesture.name },
    { label: t("sponsor.renew.name"), value: view.displayName },
    {
      label: t("sponsor.renew.currentEnd"),
      value: formatDate(view.endsAt, locale),
    },
    { label: t("sponsor.renew.newEnd"), value: formatDate(newEnd, locale) },
    {
      label: t("sponsor.renew.amount"),
      value: formatMoney(view.amountCents, locale),
    },
  ];
  const verified = turnstileSiteKey === null || captcha !== null;
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Text className="font-semibold text-primary-strong" size="body-sm">
          {t("sponsor.renew.eyebrow")}
        </Text>
        <Heading level={1}>{t("sponsor.renew.title")}</Heading>
        <Text tone="muted">{t("sponsor.renew.description")}</Text>
      </div>
      <Card className="gap-3" variant="sunken">
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
      {turnstileSiteKey ? (
        <Turnstile
          onToken={setCaptcha}
          resetKey={captchaKey}
          siteKey={turnstileSiteKey}
        />
      ) : null}
      {checkout.isError ? (
        <Text role="alert" size="body-sm" tone="danger">
          {mutationErrorMessage(checkout.error, t, "sponsor.renew.failed")}
        </Text>
      ) : null}
      <Button
        className="self-start"
        disabled={!verified}
        icon={<Lock />}
        loading={checkout.isPending}
        onClick={pay}
        size="lg"
      >
        {t("sponsor.renew.pay")}
      </Button>
      <Text size="body-sm" tone="muted">
        {verified
          ? t("sponsor.review.redirectNote")
          : t("sponsor.review.captchaHint")}
      </Text>
    </div>
  );
}
