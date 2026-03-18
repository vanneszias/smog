/**
 * @fileoverview Step 3 of the sponsorship wizard — preview & pay.
 *
 * Shows the generated preview videos (one per selected gesture) and a summary
 * card with sponsorship details and total amount. The CTA triggers the payment
 * flow via `useCreateSponsorship`.
 */

import MuxPlayer from "@mux/mux-player-react";
import { ArrowRight, Check, Heart, Loader2 } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";
import type { SponsorshipFormState } from "../hooks/useSponsorshipForm";

interface StepPreviewProps {
  form: SponsorshipFormState;
  selectedGestures: Array<{ _id: string; name: string }>;
  totalCents: number;
  onProceedToPayment: () => Promise<void>;
}

/**
 * Preview & payment step of the sponsorship wizard.
 *
 * Shows:
 * - One `MuxPlayer` per selected gesture using the pre-composed preview playbackId
 * - Sponsorship summary card (gestures, duration, name, logo, contact, total)
 * - "Proceed to payment" CTA with progress overlay (redirects to Mollie)
 */
export function StepPreview({
  form,
  selectedGestures,
  totalCents,
  onProceedToPayment,
}: StepPreviewProps) {
  const { t } = useTranslation();

  return (
    <div className="relative z-10 flex flex-1 flex-col bg-muted/20 px-4 lg:px-12">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 shrink-0 border-border border-b bg-background px-4 py-6">
        <button
          className="mb-4 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => form.setCurrentStep("details")}
          type="button"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          <span className="font-medium text-sm">Terug naar details</span>
        </button>

        {/* Progress indicator — step 3 of 3 */}
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 font-semibold text-primary text-sm">
            <Check className="h-4 w-4" />
          </div>
          <div className="h-1 w-12 rounded-full bg-primary" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 font-semibold text-primary text-sm">
            <Check className="h-4 w-4" />
          </div>
          <div className="h-1 w-12 rounded-full bg-primary" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-semibold text-sm text-white">
            3
          </div>
        </div>

        <h1 className="font-bold text-2xl">Bekijk je preview</h1>
        <p className="mt-2 text-muted-foreground">
          Laatste stap voordat je naar de betaling gaat
        </p>
      </header>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24">
        <div className="mx-auto max-w-md space-y-6">
          {/* One video player per selected gesture */}
          {selectedGestures.map((gesture, index) => {
            const playbackId = form.previewPlaybackIds[index];
            return playbackId ? (
              <div className="space-y-2" key={gesture._id}>
                {selectedGestures.length > 1 && (
                  <p className="font-medium text-sm">{gesture.name}</p>
                )}
                <div className="overflow-hidden rounded-2xl border-2 border-border shadow-xl">
                  <MuxPlayer
                    accentColor="#00805f"
                    playbackId={playbackId}
                    streamType="on-demand"
                    style={{ width: "100%", aspectRatio: "810/1080" }}
                  />
                </div>
              </div>
            ) : null;
          })}

          {/* Summary card */}
          <div className="space-y-4 rounded-2xl border-2 border-primary/20 bg-card p-5">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">
                {t("web.sponsors.wizard.sponsorshipDetails")}
              </h3>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gebaren</span>
                <span className="font-medium">
                  {form.selectedGestureIds.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("web.sponsors.wizard.duration")}
                </span>
                <span className="font-medium">
                  {t("web.sponsors.wizard.durationValue")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Naam in video</span>
                <span className="font-medium">{form.sponsorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Logo</span>
                <span className="font-medium">
                  {form.includeLogo ? "Ja" : "Nee"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span className="truncate font-medium">
                  {form.contactEmail}
                </span>
              </div>
            </div>

            <div className="border-primary/20 border-t pt-4">
              <div className="flex justify-between font-bold text-xl">
                <span>{t("web.sponsors.wizard.totalAmount")}</span>
                <span className="text-primary">{formatPrice(totalCents)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed footer CTA */}
      <div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background/95 px-4 py-4 pb-safe-bottom shadow-lg backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          <Button
            className="progress-button h-14 w-full rounded-xl font-semibold text-base"
            data-progress={form.isProcessing ? "true" : undefined}
            disabled={form.isProcessing}
            onClick={onProceedToPayment}
            size="lg"
            style={
              form.isProcessing
                ? ({
                    "--progress": form.paymentProgress,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {form.isProcessing && (
              <div
                className="pointer-events-none absolute inset-0 bg-white/20 transition-transform duration-300 ease-out"
                style={{
                  transform: `translateX(${(form.paymentProgress - 1) * 100}%)`,
                }}
              />
            )}
            <span className="relative z-10 flex items-center">
              {form.isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("web.sponsors.wizard.processing")}
                  <span className="ml-2 tabular-nums">
                    {Math.round(form.paymentProgress * 100)}%
                  </span>
                </>
              ) : (
                <>
                  <Heart className="mr-2 h-5 w-5" />
                  {t("web.sponsors.wizard.proceedToPayment")}
                </>
              )}
            </span>
          </Button>
          <p className="text-center text-muted-foreground text-xs">
            {t("web.sponsors.wizard.redirectMessage")}
          </p>
        </div>
      </div>
    </div>
  );
}
