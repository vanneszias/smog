import { formatPrice } from "@/lib/pricing";

type SponsorshipStep = "upload" | "preview" | "details" | "payment";

type PreviewStepProps = {
  gesture: { name: string };
  composedVideoUrl: string;
  durationWeeks: number;
  pricing: { totalCents: number };
  setStep: (step: SponsorshipStep) => void;
};

export function PreviewStep({
  gesture,
  composedVideoUrl,
  durationWeeks,
  pricing,
  setStep,
}: PreviewStepProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2
        className="mb-6 font-semibold text-xl"
        style={{ color: "var(--text)" }}
      >
        Preview Your Sponsored Video
      </h2>

      {/* Video Preview */}
      <video className="mb-6 w-full rounded" controls src={composedVideoUrl}>
        <track kind="captions" />
      </video>

      <div className="mb-6 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-2 font-semibold" style={{ color: "var(--text)" }}>
          Campaign Summary
        </h3>
        <ul
          className="space-y-1 text-sm"
          style={{ color: "var(--text-light)" }}
        >
          <li>Gesture: {gesture.name}</li>
          <li>Duration: {durationWeeks} weeks</li>
          <li>Total Cost: {formatPrice(pricing.totalCents)}</li>
        </ul>
      </div>

      <div className="flex gap-4">
        <button
          className="flex-1 rounded border border-border py-3 font-semibold hover:bg-gray-50"
          onClick={() => setStep("upload")}
          style={{ color: "var(--text)" }}
          type="button"
        >
          Edit
        </button>
        <button
          className="flex-1 rounded py-3 font-semibold text-white"
          onClick={() => setStep("details")}
          style={{ backgroundColor: "var(--primary)" }}
          type="button"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
