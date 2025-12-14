import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { calculatePrice } from "@/lib/pricing";
import { AlreadySponsoredState } from "./components/AlreadySponsoredState";
import { DetailsStep } from "./components/DetailsStep";
import { LoadingState } from "./components/LoadingState";
import { PreviewStep } from "./components/PreviewStep";
import { ProgressSteps } from "./components/ProgressSteps";
import { UploadStep } from "./components/UploadStep";
import { useSponsorshipForm } from "./hooks/useSponsorshipForm";

export const Route = createFileRoute("/sponsors/$gestureId")({
  component: SponsorshipFormComponent,
});

function SponsorshipFormComponent() {
  const { gestureId } = Route.useParams();
  const navigate = useNavigate();

  const {
    step,
    setStep,
    imageFile,
    imagePreview,
    overlayText,
    setText,
    durationWeeks,
    setDurationWeeks,
    sponsorName,
    setSponsorName,
    sponsorEmail,
    setSponsorEmail,
    overlayConfig,
    setOverlayConfig,
    composedVideoUrl,
    isComposing,
    composeProgress,
    handleImageUpload,
    handleComposeVideo,
    handleSubmit,
    gesture,
    activeSponsorship,
    error,
  } = useSponsorshipForm({ gestureId });

  if (!gesture) {
    return <LoadingState message="Loading gesture..." />;
  }

  if (activeSponsorship) {
    return (
      <AlreadySponsoredState
        endDate={activeSponsorship.endDate}
        onChooseAnother={() => navigate({ to: "/sponsors" })}
      />
    );
  }

  const pricing = calculatePrice(durationWeeks);

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            className="mb-4 flex items-center text-sm hover:underline"
            onClick={() =>
              step === "upload"
                ? navigate({ to: "/sponsors" })
                : setStep("upload")
            }
            style={{ color: "var(--text-light)" }}
            type="button"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </button>
          <h1
            className="mb-2 font-bold text-3xl"
            style={{ color: "var(--text)" }}
          >
            Sponsor: {gesture.name}
          </h1>
          <p style={{ color: "var(--text-light)" }}>
            Create your sponsored video campaign
          </p>
        </div>

        {/* Progress Steps */}
        <ProgressSteps currentStep={step} />

        {/* Error Message */}
        {error ? (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        ) : null}

        {/* Step Content */}
        {step === "upload" ? (
          <UploadStep
            composeProgress={composeProgress}
            durationWeeks={durationWeeks}
            gesture={gesture}
            handleComposeVideo={handleComposeVideo}
            handleImageUpload={handleImageUpload}
            imageFile={imageFile}
            imagePreview={imagePreview}
            isComposing={isComposing}
            overlayConfig={overlayConfig}
            overlayText={overlayText}
            setDurationWeeks={setDurationWeeks}
            setOverlayConfig={setOverlayConfig}
            setText={setText}
          />
        ) : null}

        {step === "preview" && composedVideoUrl ? (
          <PreviewStep
            composedVideoUrl={composedVideoUrl}
            durationWeeks={durationWeeks}
            gesture={gesture}
            pricing={pricing}
            setStep={setStep}
          />
        ) : null}

        {step === "details" ? (
          <DetailsStep
            handleSubmit={handleSubmit}
            setSponsorEmail={setSponsorEmail}
            setSponsorName={setSponsorName}
            setStep={setStep}
            sponsorEmail={sponsorEmail}
            sponsorName={sponsorName}
          />
        ) : null}
      </div>
    </div>
  );
}
