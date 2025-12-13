type SponsorshipStep = "upload" | "preview" | "details" | "payment";

type DetailsStepProps = {
  sponsorName: string;
  sponsorEmail: string;
  setSponsorName: (name: string) => void;
  setSponsorEmail: (email: string) => void;
  setStep: (step: SponsorshipStep) => void;
  handleSubmit: () => void;
};

export function DetailsStep({
  sponsorName,
  sponsorEmail,
  setSponsorName,
  setSponsorEmail,
  setStep,
  handleSubmit,
}: DetailsStepProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2
        className="mb-6 font-semibold text-xl"
        style={{ color: "var(--text)" }}
      >
        Sponsor Information
      </h2>

      <div className="mb-4">
        <label
          className="mb-2 block font-medium"
          htmlFor="sponsor-name"
          style={{ color: "var(--text)" }}
        >
          Your Name / Company
        </label>
        <input
          className="w-full rounded border border-border px-4 py-2"
          id="sponsor-name"
          onChange={(e) => setSponsorName(e.target.value)}
          placeholder="John Doe"
          required
          style={{ color: "var(--text)" }}
          type="text"
          value={sponsorName}
        />
      </div>

      <div className="mb-6">
        <label
          className="mb-2 block font-medium"
          htmlFor="sponsor-email"
          style={{ color: "var(--text)" }}
        >
          Email Address
        </label>
        <input
          className="w-full rounded border border-border px-4 py-2"
          id="sponsor-email"
          onChange={(e) => setSponsorEmail(e.target.value)}
          placeholder="john@example.com"
          required
          style={{ color: "var(--text)" }}
          type="email"
          value={sponsorEmail}
        />
      </div>

      <div className="flex gap-4">
        <button
          className="flex-1 rounded border border-border py-3 font-semibold hover:bg-gray-50"
          onClick={() => setStep("preview")}
          style={{ color: "var(--text)" }}
          type="button"
        >
          Back
        </button>
        <button
          className="flex-1 rounded py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!(!!sponsorName && !!sponsorEmail)}
          onClick={handleSubmit}
          style={{ backgroundColor: "var(--primary)" }}
          type="button"
        >
          Proceed to Payment
        </button>
      </div>
    </div>
  );
}
