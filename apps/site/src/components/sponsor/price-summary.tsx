import { useTranslation } from "@smog/i18n/react";
import { priceSponsorship } from "@smog/sponsorships/schema";
import { Card, cn, Heading } from "@smog/ui-web";
import { formatMoney } from "@smog/utils";
import type { ReactNode } from "react";
import { usePageLocale } from "./page-locale";

export interface PriceSummaryProps {
  className?: string;
  count: number;
  logo: boolean;
}

/**
 * "Price summary" (S-09): `{n} gestures × 1 year`, the logo add-on and the
 * total, from `priceSponsorship` (the server's function). No VAT line.
 */
export function PriceSummary({
  className,
  count,
  logo,
}: PriceSummaryProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  if (count < 1) {
    return null;
  }
  // Both lines come from the one pricing function: the add-on is the difference.
  const total = priceSponsorship({ count, logo }).totalCents;
  const base = priceSponsorship({ count, logo: false }).totalCents;
  return (
    <Card className={cn("gap-3", className)} variant="sunken">
      <Heading level={3} size="title-3">
        {t("sponsor.price.title")}
      </Heading>
      <dl className="flex flex-col gap-2 text-body-sm">
        <div className="flex justify-between gap-4">
          <dt>{t("sponsor.price.base", { count })}</dt>
          <dd className="tabular-nums">{formatMoney(base, locale)}</dd>
        </div>
        {logo ? (
          <div className="flex justify-between gap-4">
            <dt>{t("sponsor.price.logo")}</dt>
            <dd className="tabular-nums">
              {formatMoney(total - base, locale)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-border-subtle border-t pt-2 font-semibold text-body">
          <dt>{t("sponsor.price.total")}</dt>
          <dd className="tabular-nums" data-testid="price-total">
            {formatMoney(total, locale)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
