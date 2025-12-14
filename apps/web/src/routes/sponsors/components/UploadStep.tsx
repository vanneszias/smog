import type { OverlayConfig } from "@smog/types";
import { Upload } from "lucide-react";
import { OverlayEditor } from "@/components/overlay/OverlayEditor";
import {
  calculatePrice,
  DURATION_OPTIONS,
  formatPrice,
  getPriceBreakdown,
} from "@/lib/pricing";

type UploadStepProps = {
  gesture: { name: string };
  imageFile: File | null;
  imagePreview: string | null;
  overlayText: string;
  durationWeeks: number;
  isComposing: boolean;
  composeProgress: number;
  overlayConfig: OverlayConfig;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setText: (text: string) => void;
  setDurationWeeks: (weeks: number) => void;
  setOverlayConfig: (config: OverlayConfig) => void;
  handleComposeVideo: () => void;
};

export function UploadStep({
  imageFile,
  imagePreview,
  overlayText,
  durationWeeks,
  isComposing,
  composeProgress,
  overlayConfig,
  handleImageUpload,
  setText,
  setDurationWeeks,
  setOverlayConfig,
  handleComposeVideo,
}: UploadStepProps) {
  return (
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
        <p className="mb-3 text-sm" style={{ color: "var(--text-light)" }}>
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
      </div>

      {/* Overlay Editor - replaces simple preview */}
      {imagePreview ? (
        <div className="mb-6">
          <OverlayEditor
            imageFile={imageFile}
            imagePreview={imagePreview}
            initialConfig={overlayConfig}
            onConfigChange={setOverlayConfig}
            onTextChange={setText}
            overlayText={overlayText}
          />
        </div>
      ) : (
        <div className="mb-6">
          <label
            className="mb-2 block font-medium"
            htmlFor="overlay-text"
            style={{ color: "var(--text)" }}
          >
            Overlay Text
          </label>
          <p className="mb-3 text-sm" style={{ color: "var(--text-light)" }}>
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
      )}

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
        <p className="mt-2 text-sm" style={{ color: "var(--text-light)" }}>
          {getPriceBreakdown(durationWeeks)}
        </p>
      </div>

      {/* Next Button */}
      <button
        className="w-full rounded py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!(!!imageFile && !!overlayText) || isComposing}
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
  );
}
