import { useTranslation } from "@smog/i18n/react";
import { Button, Text } from "@smog/ui-web";
import { formatMoney } from "@smog/utils";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { usePageLocale } from "./page-locale";

export interface SelectionBarProps {
  count: number;
  onContinue: () => void;
  /** `priceSponsorship(…).totalCents` of the selection. */
  totalCents: number;
}

/**
 * The sticky bar under step 1 (S-03): how many gestures are chosen, the
 * total (`formatMoney`) and Continue. It stays in view while the grid
 * scrolls; the count is announced as it changes.
 */
export function SelectionBar({
  count,
  onContinue,
  totalCents,
}: SelectionBarProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  return (
    <div className="sticky bottom-0 z-[1] -mx-4 border-border-subtle border-t bg-surface px-4 py-3 shadow-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 dark:shadow-none">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3">
        <div aria-live="polite" className="flex flex-col">
          <Text className="font-semibold" data-testid="selection-count">
            {t("sponsor.bar.selected", { count })}
          </Text>
          <Text size="body-sm" tone="muted">
            {t("sponsor.bar.total", { price: formatMoney(totalCents, locale) })}
          </Text>
        </div>
        <Button
          disabled={count === 0}
          icon={<ArrowRight />}
          onClick={onContinue}
        >
          {t("sponsor.bar.continue")}
        </Button>
      </div>
    </div>
  );
}
