type SponsorshipStep = "upload" | "preview" | "details" | "payment";

type ProgressStepsProps = {
  currentStep: SponsorshipStep;
};

export function ProgressSteps({ currentStep }: ProgressStepsProps) {
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "preview", label: "Preview" },
    { key: "details", label: "Details" },
    { key: "payment", label: "Payment" },
  ] as const;

  return (
    <div className="mb-8 flex items-center justify-center gap-4">
      {steps.map((s, index) => (
        <div className="flex items-center" key={s.key}>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${
              s.key === currentStep
                ? "bg-primary text-white"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {index + 1}
          </div>
          {index < 3 ? <div className="mx-2 h-0.5 w-12 bg-gray-200" /> : null}
        </div>
      ))}
    </div>
  );
}
