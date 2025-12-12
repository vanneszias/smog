import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import {
  calculatePrice,
  DURATION_OPTIONS,
  formatPrice,
  getPriceBreakdown,
} from "@/lib/pricing";
import { client } from "@/utils/orpc";

type SponsorshipStep = "upload" | "preview" | "details" | "payment";

export const Route = createFileRoute("/sponsors/$gestureId")({
  component: SponsorshipFormComponent,
});

function SponsorshipFormComponent() {
  const { gestureId } = Route.useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<SponsorshipStep>("upload");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [overlayText, setText] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [composedVideoBlob, setComposedVideoBlob] = useState<Blob | null>(null);
  const [composedVideoUrl, setComposedVideoUrl] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const gesture = useQuery(api.gestures.getById, {
    id: gestureId as Id<"gestures">,
  });

  const activeSponsorship = useQuery(api.sponsorships.getActiveByGesture, {
    gestureId: gestureId as Id<"gestures">,
  });

  const generateUploadUrl = useMutation(api.sponsorships.generateUploadUrl);
  const createSponsorship = useMutation(api.sponsorships.create);
  const updatePaymentId = useMutation(api.sponsorships.updatePaymentId);

  // Check if gesture is already sponsored
  useEffect(() => {
    if (activeSponsorship) {
      setError("This gesture is already sponsored.");
    }
  }, [activeSponsorship]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be less than 2MB");
      return;
    }

    setImageFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleComposeVideo = async () => {
    if (!(imageFile && gesture)) {
      return;
    }

    console.log("[Sponsors] Starting video composition...");
    setIsComposing(true);
    setError(null);

    try {
      // 1. Upload overlay image to Convex storage first
      console.log("[Sponsors] Uploading overlay image...");
      setComposeProgress(5);

      const imageUploadUrl = await generateUploadUrl();
      const imageUploadRes = await fetch(imageUploadUrl, {
        method: "POST",
        headers: { "Content-Type": imageFile.type },
        body: imageFile,
      });
      const { storageId: imageStorageId } = await imageUploadRes.json();

      setComposeProgress(10);
      console.log("[Sponsors] Image uploaded, storage ID:", imageStorageId);

      // 2. Start server-side video composition job
      console.log("[Sponsors] Starting server-side video composition...");
      const composeResponse = await client.sponsorships.composeVideo({
        playbackId: gesture.playbackId,
        overlayImageStorageId: imageStorageId,
        overlayText,
      });

      if (!(composeResponse.success && composeResponse.jobId)) {
        throw new Error("Failed to start video composition");
      }

      const jobId = composeResponse.jobId;
      console.log("[Sponsors] Job started with ID:", jobId);
      setComposeProgress(15);

      // 3. Poll for job status using WebSocket simulation (fake progress + final check)
      // We'll fake progress from 15-90, then check final status
      const startTime = Date.now();
      const estimatedDuration = 30_000; // 30 seconds estimated

      let completed = false;
      let videoStorageId: string | undefined;

      // Fake progress for better UX
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const fakeProgress = Math.min(
          90,
          15 + (elapsed / estimatedDuration) * 75
        );
        setComposeProgress(fakeProgress);
      }, 500);

      // Poll for actual completion every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const status = await client.sponsorships.getCompositionStatus({
            jobId,
          });
          console.log("[Sponsors] Job status:", status);

          if (status.state === "completed" && status.result) {
            const result = status.result as {
              success: boolean;
              storageId?: string;
              error?: string;
            };
            if (result.success && result.storageId) {
              videoStorageId = result.storageId;
              completed = true;
              clearInterval(pollInterval);
              clearInterval(progressInterval);
            } else {
              throw new Error(result.error || "Video composition failed");
            }
          } else if (status.state === "failed") {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            throw new Error("Video composition job failed");
          }
        } catch (err) {
          clearInterval(pollInterval);
          clearInterval(progressInterval);
          throw err;
        }
      }, 2000);

      // Wait for completion (with 5 minute timeout)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(pollInterval);
          clearInterval(progressInterval);
          reject(new Error("Video composition timed out"));
        }, 300_000); // 5 minutes

        const checkComplete = setInterval(() => {
          if (completed) {
            clearTimeout(timeout);
            clearInterval(checkComplete);
            resolve();
          }
        }, 100);
      });

      if (!videoStorageId) {
        throw new Error(
          "Video composition completed but no storage ID returned"
        );
      }

      setComposeProgress(95);

      // 4. Get the composed video URL from Convex storage
      console.log("[Sponsors] Fetching composed video...");
      const videoUrl = `${import.meta.env.VITE_CONVEX_URL}/api/storage/${videoStorageId}`;
      const videoResponse = await fetch(videoUrl);

      if (!videoResponse.ok) {
        throw new Error("Failed to fetch composed video");
      }

      const videoBlob = await videoResponse.blob();
      console.log(
        "[Sponsors] Composition complete, blob size:",
        videoBlob.size
      );

      setComposedVideoBlob(videoBlob);
      const url = URL.createObjectURL(videoBlob);
      setComposedVideoUrl(url);
      setComposeProgress(100);
      setStep("preview");
    } catch (err) {
      console.error("[Sponsors] Video composition error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to compose video. Please try again."
      );
    } finally {
      setIsComposing(false);
      setComposeProgress(0);
    }
  };

  const handleSubmit = async () => {
    if (!(composedVideoBlob && imageFile && gesture)) return;

    setError(null);

    try {
      // Upload image to Convex storage
      const imageUploadUrl = await generateUploadUrl();
      const imageUploadRes = await fetch(imageUploadUrl, {
        method: "POST",
        headers: { "Content-Type": imageFile.type },
        body: imageFile,
      });
      const { storageId: imageStorageId } = await imageUploadRes.json();

      // Upload composed video to Convex storage
      const videoUploadUrl = await generateUploadUrl();
      const videoUploadRes = await fetch(videoUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body: composedVideoBlob,
      });
      const { storageId: videoStorageId } = await videoUploadRes.json();

      // Create sponsorship
      const pricing = calculatePrice(durationWeeks);
      const sponsorshipId = await createSponsorship({
        gestureId: gestureId as Id<"gestures">,
        sponsorName,
        sponsorEmail,
        overlayImageStorageId: imageStorageId,
        overlayText,
        sponsoredVideoStorageId: videoStorageId,
        durationWeeks,
        paymentAmount: pricing.totalCents,
      });

      // Create Mollie payment
      const paymentResponse = await client.sponsorships.createPayment({
        sponsorshipId,
        amount: pricing.totalCents,
        description: `Sponsorship: ${gesture.name} (${durationWeeks} weeks)`,
        redirectUrl: `${window.location.origin}/sponsors/success?sponsorshipId=${sponsorshipId}`,
      });

      // Update sponsorship with payment ID
      await updatePaymentId({
        sponsorshipId,
        molliePaymentId: paymentResponse.paymentId,
      });

      // Redirect to Mollie checkout
      if (paymentResponse.checkoutUrl) {
        window.location.href = paymentResponse.checkoutUrl;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err) {
      console.error("Error creating sponsorship:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create sponsorship"
      );
    }
  };

  if (!gesture) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin" />
          <p style={{ color: "var(--text)" }}>Loading gesture...</p>
        </div>
      </div>
    );
  }

  if (activeSponsorship) {
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
            {new Date(activeSponsorship.endDate).toLocaleDateString()}
          </p>
          <button
            className="rounded px-6 py-2 text-white"
            onClick={() => navigate({ to: "/sponsors" })}
            style={{ backgroundColor: "var(--primary)" }}
            type="button"
          >
            Choose Another Gesture
          </button>
        </div>
      </div>
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
        <div className="mb-8 flex items-center justify-center gap-4">
          {[
            { key: "upload", label: "Upload" },
            { key: "preview", label: "Preview" },
            { key: "details", label: "Details" },
            { key: "payment", label: "Payment" },
          ].map((s, index) => (
            <div className="flex items-center" key={s.key}>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${
                  s.key === step
                    ? "bg-primary text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {index + 1}
              </div>
              {index < 3 ? (
                <div className="mx-2 h-0.5 w-12 bg-gray-200" />
              ) : null}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error ? (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        ) : null}

        {/* Step Content */}
        {step === "upload" ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2
              className="mb-6 font-semibold text-xl"
              style={{ color: "var(--text)" }}
            >
              Upload Your Media
            </h2>

            {/* Image Upload */}
            <div className="mb-6">
              <label
                className="mb-2 block font-medium"
                htmlFor="image-upload"
                style={{ color: "var(--text)" }}
              >
                Overlay Image
              </label>
              <p
                className="mb-3 text-sm"
                style={{ color: "var(--text-light)" }}
              >
                Upload a square image (recommended 400x400px, max 2MB)
              </p>
              <div className="flex items-center gap-4">
                <label
                  className="flex cursor-pointer items-center gap-2 rounded border border-border px-4 py-2 hover:bg-gray-50"
                  htmlFor="image-upload"
                >
                  <Upload className="h-4 w-4" />
                  Choose Image
                </label>
                <input
                  accept="image/*"
                  className="hidden"
                  id="image-upload"
                  onChange={handleImageUpload}
                  type="file"
                />
                {imageFile ? (
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {imageFile.name}
                  </span>
                ) : null}
              </div>
              {imagePreview ? (
                <img
                  alt="Preview"
                  className="mt-4 h-32 w-32 rounded border object-cover"
                  src={imagePreview}
                />
              ) : null}
            </div>

            {/* Text Input */}
            <div className="mb-6">
              <label
                className="mb-2 block font-medium"
                htmlFor="overlay-text"
                style={{ color: "var(--text)" }}
              >
                Overlay Text
              </label>
              <p
                className="mb-3 text-sm"
                style={{ color: "var(--text-light)" }}
              >
                Enter text to display below your image (max 50 characters)
              </p>
              <input
                className="w-full rounded border border-border px-4 py-2"
                id="overlay-text"
                maxLength={50}
                onChange={(e) => setText(e.target.value)}
                placeholder="Your message here..."
                style={{ color: "var(--text)" }}
                type="text"
                value={overlayText}
              />
              <div
                className="mt-1 text-right text-sm"
                style={{ color: "var(--text-light)" }}
              >
                {overlayText.length}/50
              </div>
            </div>

            {/* Duration Selector */}
            <div className="mb-6">
              <label
                className="mb-2 block font-medium"
                htmlFor="duration"
                style={{ color: "var(--text)" }}
              >
                Sponsorship Duration
              </label>
              <select
                className="w-full rounded border border-border px-4 py-2"
                id="duration"
                onChange={(e) => setDurationWeeks(Number(e.target.value))}
                style={{ color: "var(--text)" }}
                value={durationWeeks}
              >
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.weeks} value={option.weeks}>
                    {option.label} -{" "}
                    {formatPrice(calculatePrice(option.weeks).totalCents)}
                  </option>
                ))}
              </select>
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--text-light)" }}
              >
                {getPriceBreakdown(durationWeeks)}
              </p>
            </div>

            {/* Next Button */}
            <button
              className="w-full rounded py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!(imageFile && overlayText) || isComposing}
              onClick={handleComposeVideo}
              style={{ backgroundColor: "var(--primary)" }}
              type="button"
            >
              {isComposing
                ? composeProgress < 10
                  ? "Loading video processor..."
                  : `Composing... ${Math.round(composeProgress)}%`
                : "Preview Video"}
            </button>

            {/* Show helpful message while composing */}
            {isComposing ? (
              <p className="mt-2 text-center text-gray-500 text-sm">
                {composeProgress < 10
                  ? "First time? Downloading video processing library (~40MB)..."
                  : "Processing your video... This may take 1-2 minutes."}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "preview" && composedVideoUrl ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2
              className="mb-6 font-semibold text-xl"
              style={{ color: "var(--text)" }}
            >
              Preview Your Sponsored Video
            </h2>

            {/* Video Preview */}
            <video
              className="mb-6 w-full rounded"
              controls
              src={composedVideoUrl}
            />

            <div className="mb-6 rounded-lg bg-gray-50 p-4">
              <h3
                className="mb-2 font-semibold"
                style={{ color: "var(--text)" }}
              >
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
        ) : null}

        {step === "details" ? (
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
                disabled={!(sponsorName && sponsorEmail)}
                onClick={handleSubmit}
                style={{ backgroundColor: "var(--primary)" }}
                type="button"
              >
                Proceed to Payment
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
