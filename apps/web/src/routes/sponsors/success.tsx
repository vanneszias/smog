import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect } from "react";

type SuccessSearch = {
  sponsorshipId?: string;
};

export const Route = createFileRoute("/sponsors/success")({
  component: SuccessComponent,
  validateSearch: (search: Record<string, unknown>): SuccessSearch => ({
    sponsorshipId: (search.sponsorshipId as string) || undefined,
  }),
});

function SuccessComponent() {
  const navigate = useNavigate();
  const { sponsorshipId } = useSearch({ from: "/sponsors/success" });

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
          Payment Successful!
        </h1>

        <p className="mb-6 text-lg" style={{ color: "var(--text-light)" }}>
          Your sponsorship is being processed. Your video will go live shortly!
        </p>

        {sponsorshipId ? (
          <p className="mb-6 text-sm" style={{ color: "var(--text-light)" }}>
            Sponsorship ID: {sponsorshipId}
          </p>
        ) : null}

        <div className="mb-6 rounded-lg bg-blue-50 p-4 text-left text-sm">
          <p className="font-medium text-blue-900">What happens next?</p>
          <ul className="mt-2 space-y-1 text-blue-800">
            <li>• Your payment has been confirmed</li>
            <li>• We're uploading your video to our servers</li>
            <li>• Your sponsored video will be live in 2-5 minutes</li>
            <li>• You'll receive a confirmation email shortly</li>
          </ul>
        </div>

        <button
          className="w-full rounded py-3 font-semibold text-white"
          onClick={() => navigate({ to: "/sponsors" })}
          style={{ backgroundColor: "var(--primary)" }}
          type="button"
        >
          Back to Sponsors
        </button>

        <p className="mt-4 text-xs" style={{ color: "var(--text-light)" }}>
          Redirecting automatically in 5 seconds...
        </p>
      </div>
    </div>
  );
}
