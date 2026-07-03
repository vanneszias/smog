/**
 * @fileoverview Floating selection summary bar for the gesture selection step.
 *
 * Appears at the bottom of the screen when at least one gesture is selected.
 * Shows the selection count, price summary, and a "Continue" button.
 *
 * @example
 * <SelectionBar
 *   count={selectedIds.length}
 *   totalCents={pricing.totalCents}
 *   onContinue={() => setStep("details")}
 * />
 */

import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";

interface SelectionBarProps {
  /** Number of currently selected gestures. */
  count: number;
  /** Total price in euro cents (used for display only). */
  totalCents: number;
  /** Called when the user clicks the "Continue" button. */
  onContinue: () => void;
}

/**
 * Floating bottom bar that summarises the current gesture selection.
 *
 * Slides in from the bottom when `count > 0` and hides automatically when
 * the selection is empty.
 */
export function SelectionBar({
  count,
  totalCents,
  onContinue,
}: SelectionBarProps) {
  const { i18n, t } = useTranslation();
  return (
    <div
      className={`fixed right-0 bottom-0 left-0 z-50 transform border-border border-t bg-background/95 shadow-2xl backdrop-blur-lg transition-all duration-300 ${
        count > 0
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto px-12 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Selection info */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-white">
              {count}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {t("web.sponsors.wizard.gesturesSelected", { count })}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.total")}:{" "}
                {formatPrice(
                  totalCents,
                  i18n.resolvedLanguage ?? i18n.language
                )}
              </p>
            </div>
          </div>

          {/* Continue button */}
          <Button
            className="h-12 gap-2 rounded-lg px-8 font-semibold shadow-lg"
            onClick={onContinue}
            size="lg"
          >
            {t("web.sponsors.wizard.continue")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
