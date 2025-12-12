import MuxPlayer from "@mux/mux-player-react";
import { ArrowLeft, Heart } from "lucide-react";
import { Suspense } from "react";
import { ShimmerSkeleton } from "../common/Skeleton";
import type { GestureCardData } from "./GestureCard";

export type GestureDetailData = GestureCardData;

type GestureDetailProps = {
  gesture: GestureDetailData;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
  onBack?: () => void;
};

export function GestureDetail({
  gesture,
  isFavorite = false,
  onToggleFavorite,
  onBack,
}: GestureDetailProps) {
  const handleFavoriteClick = () => {
    if (onToggleFavorite) {
      onToggleFavorite(gesture._id);
    }
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Header with Back Button */}
      <div className="mb-6 flex items-center justify-between">
        {onBack ? (
          <button
            className="inline-flex items-center gap-2 font-medium text-primary transition-colors hover:cursor-pointer hover:text-primary/80"
            onClick={handleBackClick}
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Gestures
          </button>
        ) : null}

        {onToggleFavorite ? (
          <button
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-all hover:bg-card"
            onClick={handleFavoriteClick}
            type="button"
          >
            <Heart
              className={`h-5 w-5 transition-all ${
                isFavorite
                  ? "fill-[#FF3B7D] stroke-[#FF3B7D]"
                  : "fill-none stroke-primary"
              }`}
            />
            {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          </button>
        ) : null}
      </div>

      {/* Title and Categories */}
      <div className="mb-8">
        <h1
          className="mb-4 font-bold text-4xl"
          style={{ color: "var(--text)" }}
        >
          {gesture.name}
        </h1>

        <div className="flex flex-wrap gap-2">
          {gesture.categories.filter(Boolean).map((cat) => (
            <span
              className="rounded-full px-4 py-1.5 font-medium text-sm"
              key={cat!._id}
              style={{
                backgroundColor: "var(--secondary)",
                color: "var(--text)",
              }}
            >
              {cat!.name}
            </span>
          ))}
        </div>
      </div>

      {/* Video Player */}
      <div
        className="mb-8 overflow-hidden rounded-xl border border-border"
        style={{ backgroundColor: "var(--card)", aspectRatio: "3/4" }}
      >
        <Suspense
          fallback={
            <ShimmerSkeleton
              className="h-full w-full"
              style={{ aspectRatio: "3/4", borderRadius: 0 }}
            />
          }
        >
          <MuxPlayer
            accentColor="var(--primary)"
            key={gesture._id}
            playbackId={gesture.playbackId}
            streamType="on-demand"
            style={{ width: "100%", height: "100%", aspectRatio: "3/4" }}
          />
        </Suspense>
      </div>

      {/* Description Section */}
      {gesture.info ? (
        <div
          className="mb-8 rounded-xl border border-border p-6"
          style={{ backgroundColor: "var(--card)" }}
        >
          <h2
            className="mb-3 font-semibold text-xl"
            style={{ color: "var(--text)" }}
          >
            Description
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {gesture.info}
          </p>
        </div>
      ) : null}

      {/* Related Concepts Section */}
      {gesture.concept.length > 0 ? (
        <div
          className="mb-8 rounded-xl border border-border p-6"
          style={{ backgroundColor: "var(--card)" }}
        >
          <h2
            className="mb-3 font-semibold text-xl"
            style={{ color: "var(--text)" }}
          >
            Related Concepts
          </h2>
          <div className="flex flex-wrap gap-2">
            {gesture.concept.map((c) => (
              <span
                className="rounded-lg px-3 py-1.5 text-sm"
                key={c}
                style={{
                  backgroundColor: "var(--muted)",
                  color: "var(--text-light)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
