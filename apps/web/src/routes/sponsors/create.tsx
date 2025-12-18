import { DEFAULT_OVERLAY_CONFIG, type OverlayConfig } from "@smog/types";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayEditor } from "@/components/overlay/OverlayEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGestures } from "@/hooks/useGestures";
import {
  calculatePrice,
  DURATION_OPTIONS,
  formatPrice,
  getPriceBreakdown,
} from "@/lib/pricing";
import { useVideoComposition } from "./hooks/useVideoComposition";
import type { CompositionStep } from "./lib/composition/types";

type CreateSearch = {
  gestureIds: string;
};

export const Route = createFileRoute("/sponsors/create")({
  component: CreateSponsorshipComponent,
  validateSearch: (search: Record<string, unknown>): CreateSearch => ({
    gestureIds: (search.gestureIds as string) || "",
  }),
});

type Step = "upload" | "preview" | "details";

function CreateSponsorshipComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const { gestures: allGestures } = useGestures();

  // Parse selected gesture IDs
  const selectedGestureIds = searchParams.gestureIds.split(",").filter(Boolean);
  const selectedGestures = allGestures.filter((g) =>
    selectedGestureIds.includes(g._id)
  );

  // Form state
  const [step, setStep] = useState<Step>("upload");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(1);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(
    DEFAULT_OVERLAY_CONFIG
  );

  // Sponsor details
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Video composition
  const composition = useVideoComposition();

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleComposeVideo = async () => {
    const hasRequirements = imageFile && selectedGestures[0];
    if (!hasRequirements) {
      return;
    }

    // For now, compose just the first video as preview
    const result = await composition.compose({
      playbackId: selectedGestures[0].playbackId,
      imageFile,
      overlayText,
      overlayConfig,
    });

    if (result.success && result.playbackId) {
      setStep("preview");
    }
  };

  const handleSubmit = async () => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log("Submission already in progress, ignoring duplicate call");
      return;
    }

    const hasRequiredData =
      composition.playbackId && imageFile && selectedGestures[0];
    if (!hasRequiredData) {
      console.error("Missing required data for sponsorship submission");
      return;
    }

    try {
      setIsSubmitting(true);

      // For now, we only support single gesture sponsorships
      // TODO: Support multiple gestures in the future
      const gesture = selectedGestures[0];

      // Import the sponsorship payment utilities
      const { createSponsorshipPayment } = await import(
        "./lib/sponsorshipPayment"
      );
      const { client } = await import("@/utils/orpc");
      const { api } = await import("@smog/convex");
      const { ConvexHttpClient } = await import("convex/browser");
      const convex = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL!);

      const result = await createSponsorshipPayment(
        {
          gestureId: gesture._id,
          gestureName: gesture.name,
          sponsorName,
          sponsorEmail,
          imageFile,
          overlayText,
          tempVideoUrl: composition.playbackId,
          durationWeeks,
          totalCents: pricing.totalCents,
          createSponsorship: (params) =>
            convex.mutation(api.sponsorships.create, params),
          updatePaymentId: (params) =>
            convex.mutation(api.sponsorships.updatePaymentId, params),
        },
        client
      );

      if (result.success && result.checkoutUrl) {
        // Redirect to Mollie payment page
        window.location.href = result.checkoutUrl;
      } else {
        console.error("Failed to create sponsorship payment:", result.error);
        setIsSubmitting(false);
        // TODO: Show error toast to user
      }
    } catch (error) {
      console.error("Error submitting sponsorship:", error);
      setIsSubmitting(false);
      // TODO: Show error toast to user
    }
  };

  const pricing = calculatePrice(durationWeeks * selectedGestureIds.length);
  const composedVideoUrl = composition.playbackId
    ? `https://stream.mux.com/${composition.playbackId}.m3u8`
    : null;

  if (selectedGestureIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="mb-4 font-bold text-2xl">
            {t("web.sponsors.noSelection", "No gestures selected")}
          </h2>
          <Button onClick={() => navigate({ to: "/sponsors" })}>
            {t("web.sponsors.selectGestures", "Select Gestures")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <Button
            className="mb-4"
            onClick={() =>
              step === "upload"
                ? navigate({ to: "/sponsors" })
                : setStep("upload")
            }
            size="sm"
            variant="ghost"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("common.back", "Back")}
          </Button>

          <h1 className="mb-2 font-bold text-2xl">
            {t("web.sponsors.createCampaign", "Create Sponsorship Campaign")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {selectedGestureIds.length}{" "}
            {selectedGestureIds.length === 1
              ? t("web.sponsors.gestureSelected", "gesture selected")
              : t("web.sponsors.gesturesSelected", "gestures selected")}
            {selectedGestures.length > 0 &&
              `: ${selectedGestures.map((g) => g.name).join(", ")}`}
          </p>

          {/* Progress Indicator */}
          <div className="mt-4 flex gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
                  step === "upload"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                1
              </div>
              <span
                className={`text-sm ${step === "upload" ? "font-medium" : ""}`}
              >
                {t("web.sponsors.upload", "Upload")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
                  step === "preview"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                2
              </div>
              <span
                className={`text-sm ${step === "preview" ? "font-medium" : ""}`}
              >
                {t("web.sponsors.preview", "Preview")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
                  step === "details"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                3
              </div>
              <span
                className={`text-sm ${step === "details" ? "font-medium" : ""}`}
              >
                {t("web.sponsors.details", "Details")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-4xl">
          {step === "upload" && (
            <UploadStep
              composeMessage={composition.message}
              composeProgress={composition.progress}
              composeStep={composition.step}
              durationWeeks={durationWeeks}
              handleComposeVideo={handleComposeVideo}
              handleImageUpload={handleImageUpload}
              imageFile={imageFile}
              imagePreview={imagePreview}
              isComposing={composition.isComposing}
              overlayConfig={overlayConfig}
              overlayText={overlayText}
              selectedGesturesCount={selectedGestureIds.length}
              setDurationWeeks={setDurationWeeks}
              setOverlayConfig={setOverlayConfig}
              setText={setOverlayText}
            />
          )}

          {step === "preview" && composedVideoUrl && (
            <PreviewStep
              composedVideoUrl={composedVideoUrl}
              durationWeeks={durationWeeks}
              pricing={pricing}
              selectedGestures={selectedGestures}
              setStep={setStep}
            />
          )}

          {step === "details" && (
            <DetailsStep
              handleSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              pricing={pricing}
              selectedGestures={selectedGestures}
              setSponsorEmail={setSponsorEmail}
              setSponsorName={setSponsorName}
              sponsorEmail={sponsorEmail}
              sponsorName={sponsorName}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Upload Step Component
function UploadStep({
  imageFile,
  imagePreview,
  overlayText,
  durationWeeks,
  isComposing,
  composeProgress,
  composeStep,
  composeMessage,
  overlayConfig,
  selectedGesturesCount,
  handleImageUpload,
  setText,
  setDurationWeeks,
  setOverlayConfig,
  handleComposeVideo,
}: {
  imageFile: File | null;
  imagePreview: string | null;
  overlayText: string;
  durationWeeks: number;
  isComposing: boolean;
  composeProgress: number;
  composeStep: CompositionStep;
  composeMessage: string;
  overlayConfig: OverlayConfig;
  selectedGesturesCount: number;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setText: (text: string) => void;
  setDurationWeeks: (weeks: number) => void;
  setOverlayConfig: (config: OverlayConfig) => void;
  handleComposeVideo: () => void;
}) {
  const { t } = useTranslation();
  const isButtonDisabled =
    imageFile === null || overlayText.length === 0 || isComposing;

  return (
    <div className="space-y-6">
      {/* Image Upload */}
      <div className="rounded-lg border bg-card p-6">
        <Label htmlFor="image-upload">
          {t("web.sponsors.overlayImage", "Overlay Image")}
        </Label>
        <p className="mb-4 text-muted-foreground text-sm">
          {t(
            "web.sponsors.imageDescription",
            "Upload a square image (recommended 400x400px, max 2MB)"
          )}
        </p>
        <div className="flex items-center gap-4">
          <label
            className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 transition-colors hover:border-primary"
            htmlFor="image-upload"
          >
            <Upload className="h-5 w-5" />
            <span>{t("web.sponsors.chooseImage", "Choose Image")}</span>
          </label>
          <input
            accept="image/*"
            className="hidden"
            id="image-upload"
            onChange={handleImageUpload}
            type="file"
          />
          {imageFile !== null && (
            <span className="text-muted-foreground text-sm">
              {imageFile.name}
            </span>
          )}
        </div>
      </div>

      {/* Overlay Editor */}
      <div className="rounded-lg border bg-card p-6">
        <OverlayEditor
          imageFile={imageFile}
          imagePreview={imagePreview}
          initialConfig={overlayConfig}
          onConfigChange={setOverlayConfig}
          onTextChange={setText}
          overlayText={overlayText}
        />
      </div>

      {/* Duration Selector */}
      <div className="rounded-lg border bg-card p-6">
        <Label htmlFor="duration">
          {t("web.sponsors.duration", "Sponsorship Duration")}
        </Label>
        <p className="mb-4 text-muted-foreground text-sm">
          {t(
            "web.sponsors.durationDescription",
            "This outro will be applied to all selected videos"
          )}
        </p>
        <select
          className="w-full rounded-lg border bg-background px-4 py-2"
          id="duration"
          onChange={(e) => setDurationWeeks(Number(e.target.value))}
          value={durationWeeks}
        >
          {DURATION_OPTIONS.map((option) => (
            <option key={option.weeks} value={option.weeks}>
              {option.label} -{" "}
              {formatPrice(
                calculatePrice(option.weeks * selectedGesturesCount).totalCents
              )}{" "}
              total
            </option>
          ))}
        </select>
        <p className="mt-2 text-muted-foreground text-sm">
          {getPriceBreakdown(durationWeeks)} × {selectedGesturesCount}{" "}
          {selectedGesturesCount === 1 ? "gesture" : "gestures"}
        </p>
      </div>

      {/* Action Button */}
      <Button
        className="w-full"
        disabled={isButtonDisabled}
        onClick={handleComposeVideo}
        size="lg"
      >
        {isComposing
          ? `${composeMessage} ${Math.round(composeProgress)}%`
          : t("web.sponsors.previewVideo", "Preview Video")}
      </Button>

      {/* Progress Display */}
      {isComposing === true && (
        <div className="rounded-lg border bg-blue-50 p-4 dark:bg-blue-950">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium text-sm">{composeMessage}</p>
            <span className="font-semibold text-sm">
              {Math.round(composeProgress)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${composeProgress}%` }}
            />
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            {getStepDescription(composeStep)}
          </p>
        </div>
      )}
    </div>
  );
}

// Preview Step Component
function PreviewStep({
  selectedGestures,
  composedVideoUrl,
  durationWeeks,
  pricing,
  setStep,
}: {
  selectedGestures: Array<{ _id: string; name: string }>;
  composedVideoUrl: string;
  durationWeeks: number;
  pricing: { totalCents: number };
  setStep: (step: Step) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 font-semibold text-xl">
          {t("web.sponsors.previewTitle", "Preview Your Sponsored Video")}
        </h2>
        <p className="mb-4 text-muted-foreground text-sm">
          {t(
            "web.sponsors.previewDescription",
            "This outro will be applied to all selected videos"
          )}
        </p>

        {/* Video Preview */}
        <video
          className="mb-6 w-full rounded-lg"
          controls
          src={composedVideoUrl}
        >
          <track kind="captions" />
        </video>

        {/* Campaign Summary */}
        <div className="rounded-lg bg-muted p-4">
          <h3 className="mb-3 font-semibold">
            {t("web.sponsors.campaignSummary", "Campaign Summary")}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("web.sponsors.gestures", "Gestures")}:
              </span>
              <span className="font-medium">
                {selectedGestures.length}{" "}
                {selectedGestures.length === 1 ? "gesture" : "gestures"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("web.sponsors.duration", "Duration")}:
              </span>
              <span className="font-medium">
                {durationWeeks}{" "}
                {durationWeeks === 1
                  ? t("common.week", "week")
                  : t("common.weeks", "weeks")}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">
                {t("web.sponsors.totalCost", "Total Cost")}:
              </span>
              <span className="font-bold text-lg">
                {formatPrice(pricing.totalCents)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button
          className="flex-1"
          onClick={() => setStep("upload")}
          variant="outline"
        >
          {t("common.edit", "Edit")}
        </Button>
        <Button className="flex-1" onClick={() => setStep("details")}>
          {t("common.continue", "Continue")}
        </Button>
      </div>
    </div>
  );
}

// Details Step Component
function DetailsStep({
  selectedGestures,
  pricing,
  sponsorName,
  sponsorEmail,
  setSponsorName,
  setSponsorEmail,
  handleSubmit,
  isSubmitting,
}: {
  selectedGestures: Array<{ _id: string; name: string }>;
  pricing: { totalCents: number };
  sponsorName: string;
  sponsorEmail: string;
  setSponsorName: (name: string) => void;
  setSponsorEmail: (email: string) => void;
  handleSubmit: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const isButtonDisabled =
    isSubmitting || sponsorName.length === 0 || sponsorEmail.length === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 font-semibold text-xl">
          {t("web.sponsors.yourDetails", "Your Details")}
        </h2>

        <div className="space-y-4">
          <div>
            <Label htmlFor="sponsor-name">
              {t("web.sponsors.name", "Name / Company")}
            </Label>
            <Input
              id="sponsor-name"
              onChange={(e) => setSponsorName(e.target.value)}
              placeholder={t(
                "web.sponsors.namePlaceholder",
                "Enter your name or company"
              )}
              value={sponsorName}
            />
          </div>

          <div>
            <Label htmlFor="sponsor-email">
              {t("web.sponsors.email", "Email")}
            </Label>
            <Input
              id="sponsor-email"
              onChange={(e) => setSponsorEmail(e.target.value)}
              placeholder={t(
                "web.sponsors.emailPlaceholder",
                "your.email@example.com"
              )}
              type="email"
              value={sponsorEmail}
            />
          </div>
        </div>
      </div>

      {/* Payment Summary */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="mb-4 font-semibold">
          {t("web.sponsors.paymentSummary", "Payment Summary")}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {selectedGestures.length}{" "}
              {selectedGestures.length === 1 ? "gesture" : "gestures"}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold text-base">
              {t("common.total", "Total")}:
            </span>
            <span className="font-bold text-xl">
              {formatPrice(pricing.totalCents)}
            </span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        className="w-full"
        disabled={isButtonDisabled}
        onClick={handleSubmit}
        size="lg"
      >
        <CheckCircle className="mr-2 h-5 w-5" />
        {isSubmitting
          ? t("web.sponsors.processing", "Processing...")
          : t("web.sponsors.proceedToPayment", "Proceed to Payment")}
      </Button>
    </div>
  );
}

function getStepDescription(step: CompositionStep): string {
  switch (step) {
    case "idle": {
      return "Ready to start";
    }
    case "preparing": {
      return "Converting your image to the right format...";
    }
    case "uploading": {
      return "Sending your composition request to the server...";
    }
    case "queued": {
      return "Waiting for an available worker to process your video...";
    }
    case "downloading": {
      return "Worker is downloading the original video from Mux...";
    }
    case "processing-image": {
      return "Worker is processing and resizing your overlay image...";
    }
    case "composing": {
      return "FFmpeg is composing the video with your overlay...";
    }
    case "uploading-result": {
      return "Uploading the final composed video back to Mux...";
    }
    case "completed": {
      return "Your video is ready!";
    }
    case "failed": {
      return "Something went wrong. Please try again.";
    }
    default: {
      return "Processing...";
    }
  }
}
