import type { GestureDetailData } from "@smog/ui";
import { ArrowLeft, Heart, Sparkles } from "lucide-react";
import { useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { PiPVideoPlayer } from "./PiPVideoPlayer";

interface EnhancedGestureDetailProps {
  gesture: GestureDetailData;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
  onBack?: () => void;
}

function SponsorshipCTA({ gestureId }: { gestureId: string }) {
  return (
    <div
      className="rounded-xl border-2 border-primary/20 bg-linear-to-br from-primary/5 to-primary/10 p-6"
      style={{ backgroundColor: "var(--card)" }}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <h2
            className="mb-2 font-semibold text-xl"
            style={{ color: "var(--text)" }}
          >
            Sponsor This Gesture
          </h2>
          <p className="mb-4 text-muted-foreground leading-relaxed">
            Make this gesture yours! Add your brand and message to the video and
            support sign language education.
          </p>
          <a
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white transition-all hover:bg-primary/90"
            href={`/sponsors/create?gestureIds=${gestureId}`}
          >
            <Sparkles className="h-4 w-4" />
            Sponsor Now
          </a>
        </div>
      </div>
    </div>
  );
}

function SponsorshipInfo({
  sponsorship,
}: {
  sponsorship: { sponsorName?: string; endDate?: number };
}) {
  return (
    <div
      className="rounded-xl border border-border p-6"
      style={{ backgroundColor: "var(--card)" }}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
          <Sparkles className="h-6 w-6 text-green-600" />
        </div>
        <div className="flex-1">
          <h2
            className="mb-2 font-semibold text-xl"
            style={{ color: "var(--text)" }}
          >
            Currently Sponsored
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {sponsorship.sponsorName
              ? `This gesture is sponsored by ${sponsorship.sponsorName}.`
              : "This gesture is currently sponsored."}
            {sponsorship.endDate
              ? ` It will be available for sponsorship again from ${new Date(sponsorship.endDate).toLocaleDateString()}.`
              : null}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EnhancedGestureDetail({
  gesture,
  isFavorite = false,
  onToggleFavorite,
  onBack,
}: EnhancedGestureDetailProps) {
  const [isPiPActive, setIsPiPActive] = useState(false);

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

  const isAvailableForSponsorship =
    !gesture.sponsorship ||
    gesture.sponsorship.status === "available" ||
    gesture.sponsorship.status === "expired";

  const isActiveSponsorship = gesture.sponsorship?.status === "active";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 shrink-0 border-border border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6 md:py-4">
          {/* Back button (mobile/tablet only) */}
          {onBack && (
            <button
              className="flex items-center gap-2 font-medium text-primary transition-colors hover:text-primary/80 lg:hidden"
              onClick={handleBackClick}
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          {/* Gesture name (truncated on small screens) */}
          <h1
            className="flex-1 truncate font-bold text-xl md:text-2xl"
            style={{ color: "var(--text)" }}
            title={gesture.name}
          >
            {gesture.name}
          </h1>

          {/* Favorite button */}
          {onToggleFavorite && (
            <button
              aria-label={
                isFavorite ? "Remove from favorites" : "Add to favorites"
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-all hover:scale-105 hover:bg-card md:h-auto md:w-auto md:gap-2 md:px-4 md:py-2"
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
              <span className="hidden font-medium md:inline">
                {isFavorite ? "Favorited" : "Favorite"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 md:px-6 md:py-6">
          {/* Categories */}
          <div className="mb-6 flex flex-wrap gap-2">
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

          {/* Video Player - Prominent placement */}
          <div className="mx-a mb-6 max-w-4xl">
            <PiPVideoPlayer
              className="w-full"
              gestureId={gesture._id}
              gestureName={gesture.name}
              onPiPChange={setIsPiPActive}
              playbackId={gesture.playbackId}
            />
            {isPiPActive && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-center dark:border-blue-800 dark:bg-blue-950">
                <p className="font-medium text-blue-700 text-sm dark:text-blue-300">
                  Video is playing in Picture-in-Picture mode. You can browse
                  other gestures while watching!
                </p>
              </div>
            )}
          </div>

          {/* Description Section - Collapsible on tablets */}
          {gesture.info && (
            <div className="mb-4">
              <CollapsibleSection defaultOpen={true} title="Description">
                <p className="text-muted-foreground leading-relaxed">
                  {gesture.info}
                </p>
              </CollapsibleSection>
            </div>
          )}

          {/* Related Concepts Section - Collapsible */}
          {gesture.concept.length > 0 && (
            <div className="mb-4">
              <CollapsibleSection defaultOpen={false} title="Related Concepts">
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
              </CollapsibleSection>
            </div>
          )}

          {/* Sponsorship Section */}
          {isAvailableForSponsorship && (
            <div className="mb-4">
              <SponsorshipCTA gestureId={gesture._id} />
            </div>
          )}

          {isActiveSponsorship &&
            gesture.sponsorship !== null &&
            gesture.sponsorship !== undefined && (
              <div className="mb-4">
                <SponsorshipInfo sponsorship={gesture.sponsorship} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
