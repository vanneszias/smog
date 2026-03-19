/**
 * @fileoverview API mutation hooks for the sponsorship wizard.
 *
 * Provides `useGeneratePreview` and `useCreateSponsorship` hooks that
 * encapsulate all API call logic, progress simulation, and error handling
 * so the wizard step components remain focused on UI only.
 */

import { createLogger } from "@smog/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { client } from "@/utils/orpc";

const logger = createLogger("useSponsorshipMutation");

import {
  createProgressTicker,
  readFileAsBase64,
} from "../utils/sponsorshipHelpers";
import type { SponsorshipFormState } from "./useSponsorshipForm";

// ─── Generate preview ─────────────────────────────────────────────────────────

interface UseGeneratePreviewOptions {
  form: SponsorshipFormState;
  selectedGestures: Array<{ _id: string; name: string }>;
}

/**
 * Generate preview videos for all selected gestures in parallel.
 *
 * Simulates per-gesture progress while real work happens and transitions
 * the wizard to the "preview" step on success.
 *
 * @param options.form - The sponsorship form state.
 * @param options.selectedGestures - Array of selected gesture objects.
 * @returns An async function to trigger the preview generation.
 */
export function useGeneratePreview({
  form,
  selectedGestures,
}: UseGeneratePreviewOptions) {
  const { t } = useTranslation();

  return async (): Promise<void> => {
    if (!form.runValidateDetails(t)) {
      return;
    }
    if (selectedGestures.length === 0) {
      return;
    }

    form.setIsGeneratingPreview(true);
    form.setPreviewProgress(0);

    try {
      let logoBase64: string | undefined;
      if (form.includeLogo && form.logoFile) {
        form.setPreviewProgress(0.05);
        logoBase64 = await readFileAsBase64(form.logoFile);
      }

      // Track per-gesture progress independently
      const perGestureProgress = selectedGestures.map(() => 0);
      const tick = createProgressTicker(0.9);

      const progressInterval = setInterval(() => {
        for (let i = 0; i < perGestureProgress.length; i++) {
          perGestureProgress[i] = tick(perGestureProgress[i] ?? 0);
        }
        const avg =
          perGestureProgress.reduce((sum, v) => sum + v, 0) /
          perGestureProgress.length;
        form.setPreviewProgress(avg);
      }, 800);

      try {
        const results = await Promise.all(
          selectedGestures.map((gesture) =>
            client.sponsorships.generatePreview({
              gestureId: gesture._id,
              sponsorName: form.sponsorName,
              logoImage: logoBase64,
              overlayText: form.sponsorName,
            })
          )
        );

        clearInterval(progressInterval);
        form.setPreviewProgress(1);
        form.setPreviewPlaybackIds(results.map((r) => r.playbackId));
        form.setCurrentStep("preview");
      } finally {
        clearInterval(progressInterval);
      }
    } catch (error) {
      logger.error("Failed to generate preview", error);
      toast.error(t("web.sponsors.wizard.errors.previewFailed"));
    } finally {
      form.setIsGeneratingPreview(false);
      form.setPreviewProgress(0);
    }
  };
}

// ─── Create sponsorship + payment ─────────────────────────────────────────────

interface UseCreateSponsorshipOptions {
  form: SponsorshipFormState;
  totalCents: number;
}

/**
 * Create bulk sponsorships and redirect to the Mollie payment checkout.
 *
 * Simulates payment-processing progress while the API calls happen.
 *
 * @param options.form - The sponsorship form state.
 * @param options.totalCents - Total payment amount in euro cents.
 * @returns An async function to trigger the sponsorship creation.
 */
export function useCreateSponsorship({
  form,
  totalCents,
}: UseCreateSponsorshipOptions) {
  const { t } = useTranslation();

  return async (): Promise<void> => {
    form.setIsProcessing(true);
    form.setPaymentProgress(0);

    const tick = createProgressTicker(0.9, 0.1);
    const progressInterval = setInterval(() => {
      form.setPaymentProgress((prev) => tick(prev));
    }, 600);

    try {
      let logoBase64: string | undefined;
      if (form.includeLogo && form.logoFile) {
        form.setPaymentProgress(0.15);
        logoBase64 = await readFileAsBase64(form.logoFile);
      }

      form.setPaymentProgress(0.3);
      const result = await client.sponsorships.createBulkSponsorshipsSimplified(
        {
          gestureIds: form.selectedGestureIds,
          sponsorName: form.sponsorName,
          sponsorEmail: form.contactEmail,
          contactFullName: form.contactFullName,
          contactCompany: form.contactCompany || undefined,
          overlayText: form.sponsorName,
          logoImage: logoBase64,
          includeLogo: form.includeLogo,
          durationYears: 1,
          previewVideoPlaybackIds: form.previewPlaybackIds,
          invoiceRequested: form.invoiceRequested || undefined,
          invoiceName: form.invoiceRequested
            ? form.invoiceName || undefined
            : undefined,
          invoiceVatNumber: form.invoiceRequested
            ? form.invoiceVatNumber || undefined
            : undefined,
          invoiceEmail: form.invoiceRequested
            ? form.invoiceEmail || undefined
            : undefined,
        }
      );

      form.setPaymentProgress(0.7);
      const payment = await client.sponsorships.createBulkPayment({
        sponsorshipIds: result.sponsorshipIds,
        amount: totalCents,
      });

      form.setPaymentProgress(1);
      clearInterval(progressInterval);

      window.location.href = payment.checkoutUrl;
    } catch (error) {
      logger.error("Failed to create sponsorships", error);
      toast.error(t("web.sponsors.wizard.errors.paymentFailed"));
      clearInterval(progressInterval);
      form.setIsProcessing(false);
      form.setPaymentProgress(0);
    }
  };
}
