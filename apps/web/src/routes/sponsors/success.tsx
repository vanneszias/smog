import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect } from "react";
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

  // Fetch sponsorships if paymentId is provided
  const { data: sponsorships } = useQuery<SponsorshipWithGesture[]>({
    queryKey: ["sponsorships", paymentId],
    queryFn: () =>
      client.sponsorships.getSponsorshipsByPaymentId({
        paymentId: paymentId!,
      }),
    enabled: !!paymentId,
  });

  useEffect(() => {
    // Auto-redirect after 10 seconds
    const timer = setTimeout(() => {
      navigate({ to: "/sponsors" });
    }, 10_000);

    return () => clearTimeout(timer);
  }, [navigate]);

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

        {/* Sponsorship summary */}
        {sponsorships && (
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
                  {sponsorships[0]?.durationYears || 1} year
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
          <ul className="mt-3 space-y-2 text-blue-800 dark:text-blue-200">
            <li className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span>{t("web.sponsors.new.success.step1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span>{t("web.sponsors.new.success.step2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span>{t("web.sponsors.new.success.step3")}</span>
            </li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 rounded-md border border-border py-3 font-medium transition-colors hover:bg-muted"
            onClick={() => navigate({ to: "/" })}
            type="button"
          >
            {t("web.sponsors.new.success.actions.backHome")}
          </button>
          <button
            className="flex-1 rounded-md bg-primary py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => navigate({ to: "/sponsors" })}
            type="button"
          >
            {t("web.sponsors.new.success.actions.viewSponsorships")}
          </button>
        </div>

        <p className="mt-4 text-xs" style={{ color: "var(--text-light)" }}>
          Automatically redirecting in 10 seconds...
        </p>
      </div>
    </div>
  );
}
