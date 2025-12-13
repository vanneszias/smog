type AlreadySponsoredStateProps = {
  endDate: number;
  onChooseAnother: () => void;
};

export function AlreadySponsoredState({
  endDate,
  onChooseAnother,
}: AlreadySponsoredStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h2
          className="mb-4 font-semibold text-2xl"
          style={{ color: "var(--text)" }}
        >
          Already Sponsored
        </h2>
        <p className="mb-6" style={{ color: "var(--text-light)" }}>
          This gesture is currently sponsored until{" "}
          {new Date(endDate).toLocaleDateString()}
        </p>
        <button
          className="rounded px-6 py-2 text-white"
          onClick={onChooseAnother}
          style={{ backgroundColor: "var(--primary)" }}
          type="button"
        >
          Choose Another Gesture
        </button>
      </div>
    </div>
  );
}
