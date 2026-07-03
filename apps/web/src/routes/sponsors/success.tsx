import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SponsorshipWithGesture } from "@/types/sponsorship";
import { client } from "@/utils/orpc";

interface SuccessSearch {
  sponsorshipId?: string;
  sponsorshipIds?: string;
  paymentId?: string;
}

export const Route = createFileRoute("/sponsors/success")({
  component: SuccessComponent,
  validateSearch: (search: Record<string, unknown>): SuccessSearch => ({
    sponsorshipId: (search.sponsorshipId as string) || undefined,
    sponsorshipIds: (search.sponsorshipIds as string) || undefined,
    paymentId: (search.paymentId as string) || undefined,
  }),
});

function SuccessComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { paymentId } = useSearch({
    from: "/sponsors/success",
  });
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const maxPollingAttempts = 15; // 15 attempts × 2 seconds = 30 seconds max

  // Fetch sponsorships if paymentId is provided
  const {
    data: sponsorships,
    isLoading,
    isError,
    refetch,
  } = useQuery<SponsorshipWithGesture[]>({
    queryKey: ["sponsorships", paymentId],
    queryFn: () => {
      return client.sponsorships.getSponsorshipsByPaymentId({
        paymentId: paymentId!,
      });
    },
    enabled: !!paymentId,
    retry: 3,
    retryDelay: 1000,
    refetchInterval: (data) => {
      // If we have a paymentId but no sponsorships, poll every 2 seconds
      // This handles the race condition where webhook hasn't fired yet
      if (
        paymentId &&
        (!data || (Array.isArray(data) && data.length === 0)) &&
        pollingAttempts < maxPollingAttempts
      ) {
        setPollingAttempts((prev) => prev + 1);
        return 2000;
      }
      // Stop polling once we have data or reached max attempts
      return false;
    },
    refetchIntervalInBackground: true,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Check className="h-10 w-10 text-white" />
        </div>

        <h1
          className="mb-4 font-bold text-2xl"
          style={{ color: "var(--text)" }}
        >
          {t("web.sponsors.success.title")}
        </h1>

        <p className="mb-2 text-lg" style={{ color: "var(--text-light)" }}>
          {t("web.sponsors.new.success.subtitle")}
        </p>

        {/* No payment ID warning */}
        {!paymentId && (
          <div className="mt-4 rounded-lg bg-orange-50 p-4 text-left dark:bg-orange-950">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-medium text-orange-900 text-sm dark:text-orange-100">
                  {t("web.sponsors.success.noPaymentId.title")}
                </p>
                <p className="mt-1 text-orange-800 text-xs dark:text-orange-200">
                  {t("web.sponsors.success.noPaymentId.description")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {paymentId && isLoading && (
          <output
            aria-live="polite"
            className="mt-4 rounded-lg bg-muted p-4 text-center"
          >
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">
              {t("web.sponsors.success.loading")}
            </p>
          </output>
        )}

        {/* Error state */}
        {paymentId && isError && (
          <div className="mt-4 rounded-lg bg-red-50 p-4 text-left dark:bg-red-950">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <p className="font-medium text-red-900 text-sm dark:text-red-100">
                  {t("web.sponsors.success.error.title")}
                </p>
                <p className="mt-1 text-red-800 text-xs dark:text-red-200">
                  {t("web.sponsors.success.error.description")}
                </p>
                <button
                  className="mt-2 text-red-900 text-sm underline dark:text-red-100"
                  onClick={() => refetch()}
                  type="button"
                >
                  {t("web.sponsors.success.error.tryAgain")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state (webhook hasn't fired yet) */}
        {paymentId &&
          !isLoading &&
          !isError &&
          (!sponsorships || sponsorships.length === 0) &&
          pollingAttempts < maxPollingAttempts && (
            <div className="mt-4 rounded-lg bg-yellow-50 p-4 text-left dark:bg-yellow-950">
              <div className="flex items-start gap-3">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
                    {t("web.sponsors.success.processing.title")}
                  </p>
                  <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                    {t("web.sponsors.success.processing.description")}
                  </p>
                  <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                    {t("web.sponsors.success.processing.attempt", {
                      current: pollingAttempts,
                      max: maxPollingAttempts,
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Polling timeout */}
        {paymentId &&
          !isLoading &&
          !isError &&
          (!sponsorships || sponsorships.length === 0) &&
          pollingAttempts >= maxPollingAttempts && (
            <div className="mt-4 rounded-lg bg-orange-50 p-4 text-left dark:bg-orange-950">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
                <div>
                  <p className="font-medium text-orange-900 text-sm dark:text-orange-100">
                    {t("web.sponsors.success.timeout.title")}
                  </p>
                  <p className="mt-1 text-orange-800 text-xs dark:text-orange-200">
                    {t("web.sponsors.success.timeout.description")}
                  </p>
                  <button
                    className="mt-2 text-orange-900 text-sm underline dark:text-orange-100"
                    onClick={() => {
                      setPollingAttempts(0);
                      refetch();
                    }}
                    type="button"
                  >
                    {t("web.sponsors.success.timeout.checkAgain")}
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Sponsorship summary (success state) */}
        {sponsorships && sponsorships.length > 0 && (
          <div className="mt-4 mb-6 rounded-lg bg-muted p-4 text-left">
            <h3 className="mb-2 font-semibold text-sm">
              {t("web.sponsors.new.success.summary")}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("web.sponsors.new.success.gestures")}:
                </span>
                <span className="font-medium">
                  {sponsorships.map((s) => s.gestureName).join(", ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("web.sponsors.new.success.sponsor")}:
                </span>
                <span className="font-medium">
                  {sponsorships[0]?.sponsorName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("web.sponsors.new.success.duration")}:
                </span>
                <span className="font-medium">
                  {t(
                    (sponsorships[0]?.durationYears || 1) === 1
                      ? "common.year"
                      : "common.years",
                    { count: sponsorships[0]?.durationYears || 1 }
                  )}
                </span>
              </div>
              <div className="flex justify-between border-border border-t pt-2">
                <span className="text-muted-foreground">
                  {t("web.sponsors.new.success.total")}:
                </span>
                <span className="font-semibold">
                  €
                  {(
                    sponsorships.reduce(
                      (sum: number, s) => sum + s.paymentAmount,
                      0
                    ) / 100
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-lg bg-blue-50 p-4 text-left text-sm dark:bg-blue-950">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            {t("web.sponsors.new.success.whatNext")}
          </p>
          <p className="mt-3 text-blue-800 dark:text-blue-200">
            {t("web.sponsors.success.reviewDescription")}
          </p>
        </div>

        <button
          className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => navigate({ to: "/" })}
          type="button"
        >
          {t("web.sponsors.new.success.actions.backHome")}
        </button>
      </div>
    </div>
  );
}
