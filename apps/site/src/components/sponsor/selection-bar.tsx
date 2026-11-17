import { useTranslation } from "@smog/i18n/react";
import { Button, cn, Text } from "@smog/ui-web";
import { formatMoney } from "@smog/utils";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useOverlayBarOpen, useReservedSpace } from "@/lib/use-reserved-space";
import { usePageLocale } from "./page-locale";

export interface SelectionBarProps {
  count: number;
  onContinue: () => void;
  /** `priceSponsorship(…).totalCents` of the selection. */
  totalCents: number;
}

/**
 * The sticky bar under step 1 (S-03): how many gestures are chosen, the
 * total (`formatMoney`) and Continue, the orange "do it" of the step. It
 * stays in view while the grid scrolls, inside the content column with the
 * card's rounded top; the count is announced as it changes. Its height is
 * reserved as scroll padding, so a control that takes focus (Load more, a
 * card) is never scrolled under it (WCAG 2.4.11, phase review M-4).
 *
 * One bottom bar at a time: while the consent banner is open
 * (`useOverlayBarOpen`), the bar steps into the flow at the end of the
 * step instead of stacking over it, and sticks again once the visitor
 * has answered.
 */
export function SelectionBar({
  count,
  onContinue,
  totalCents,
}: SelectionBarProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const reserve = useReservedSpace();
  const overlayOpen = useOverlayBarOpen();
  return (
    <div
      className={cn(
        "z-10 border border-border-subtle bg-card px-4 py-3 md:px-6",
        overlayOpen
          ? "rounded-card"
          : "sticky bottom-0 rounded-t-card border-b-0 pb-[max(--spacing(3),env(safe-area-inset-bottom))] shadow-2 dark:shadow-none"
      )}
      data-slot="selection-bar"
      data-sticky={overlayOpen ? "false" : "true"}
      ref={overlayOpen ? undefined : reserve}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div aria-live="polite" className="flex flex-col">
          <Text className="font-semibold" data-testid="selection-count">
            {t("sponsor.bar.selected", { count })}
          </Text>
          <Text className="tabular-nums" size="body-sm" tone="muted">
            {t("sponsor.bar.total", { price: formatMoney(totalCents, locale) })}
          </Text>
        </div>
        <Button
          disabled={count === 0}
          icon={<ArrowRight />}
          onClick={onContinue}
          variant="action"
        >
          {t("sponsor.bar.continue")}
        </Button>
      </div>
    </div>
  );
}
