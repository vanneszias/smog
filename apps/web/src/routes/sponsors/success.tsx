import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface SuccessSearch {
  sponsorshipId?: string;
  sponsorshipIds?: string;
}

export const Route = createFileRoute("/sponsors/success")({
  component: SuccessComponent,
  validateSearch: (search: Record<string, unknown>): SuccessSearch => ({
    sponsorshipId: (search.sponsorshipId as string) || undefined,
    sponsorshipIds: (search.sponsorshipIds as string) || undefined,
  }),
});

function SuccessComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sponsorshipId, sponsorshipIds } = useSearch({
    from: "/sponsors/success",
  });

  const sponsorshipCount = sponsorshipIds
    ? sponsorshipIds.split(",").length
    : 1;

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setTimeout(() => {
      navigate({ to: "/sponsors" });
    }, 5000);

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

        <p className="mb-6 text-lg" style={{ color: "var(--text-light)" }}>
          {sponsorshipCount > 1
            ? t("web.sponsors.success.multipleDescription", {
                count: sponsorshipCount,
              })
            : t("web.sponsors.success.singleDescription")}
        </p>

        {sponsorshipId || sponsorshipIds ? (
          <p className="mb-6 text-sm" style={{ color: "var(--text-light)" }}>
            {sponsorshipCount > 1
              ? t("web.sponsors.success.sponsorshipsCreated", {
                  count: sponsorshipCount,
                })
              : t("web.sponsors.success.sponsorshipId", { id: sponsorshipId })}
          </p>
        ) : null}

        <div className="mb-6 rounded-lg bg-blue-50 p-4 text-left text-sm">
          <p className="font-medium text-blue-900">
            {t("web.sponsors.success.whatNext")}
          </p>
          <ul className="mt-2 space-y-1 text-blue-800">
            <li>• {t("web.sponsors.success.steps.confirmed")}</li>
            <li>
              •{" "}
              {sponsorshipCount > 1
                ? t("web.sponsors.success.steps.uploadingMultiple")
                : t("web.sponsors.success.steps.uploadingSingle")}
            </li>
            <li>
              •{" "}
              {sponsorshipCount > 1
                ? t("web.sponsors.success.steps.liveMultiple")
                : t("web.sponsors.success.steps.liveSingle")}
            </li>
            <li>• {t("web.sponsors.success.steps.email")}</li>
          </ul>
        </div>

        <button
          className="w-full rounded py-3 font-semibold text-white"
          onClick={() => navigate({ to: "/sponsors" })}
          style={{ backgroundColor: "var(--primary)" }}
          type="button"
        >
          {t("web.sponsors.success.backToSponsors")}
        </button>

        <p className="mt-4 text-xs" style={{ color: "var(--text-light)" }}>
          {t("web.sponsors.success.redirecting")}
        </p>
      </div>
    </div>
  );
}
