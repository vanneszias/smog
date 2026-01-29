import MuxPlayer from "@mux/mux-player-react";
import { ArrowLeft, Heart, Smartphone, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { ShimmerSkeleton } from "../common/Skeleton";
import type { GestureCardData } from "./GestureCard";

export type GestureDetailData = GestureCardData & {
  sponsorship?: {
    status: string;
    sponsorName?: string;
    endDate?: number;
  } | null;
};

interface GestureDetailProps {
  gesture: GestureDetailData;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
  onBack?: () => void;
  showOpenInApp?: boolean;
  onOpenInApp?: () => void;
}

function SponsorshipCTA({
  gestureId,
  t,
}: {
  gestureId: string;
  t: (key: string, fallback: string) => string;
}) {
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
            {t("ui.gestureDetail.sponsorThisGesture", "Sponsor This Gesture")}
          </h2>
          <p className="mb-4 text-muted-foreground leading-relaxed">
            {t(
              "ui.gestureDetail.sponsorDescription",
              "Make this gesture yours! Add your brand and message to the video and support sign language education."
            )}
          </p>
          <a
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white transition-all hover:bg-primary/90"
            href={`/sponsors?gestureId=${gestureId}`}
          >
            <Sparkles className="h-4 w-4" />
            {t("ui.gestureDetail.sponsorNow", "Sponsor Now")}
          </a>
        </div>
      </div>
    </div>
  );
}

function SponsorshipInfo({
  sponsorship,
  t,
}: {
  sponsorship: { sponsorName?: string; endDate?: number };
  t: (key: string, fallback: string) => string;
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
            {t("ui.gestureDetail.currentlySponsored", "Currently Sponsored")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {sponsorship.sponsorName
              ? t(
                  "ui.gestureDetail.sponsoredBy",
                  `This gesture is sponsored by ${sponsorship.sponsorName}.`
                )
              : t(
                  "ui.gestureDetail.sponsored",
                  "This gesture is currently sponsored."
                )}
            {sponsorship.endDate ? (
              <>
                {" "}
                {t(
                  "ui.gestureDetail.availableFrom",
                  `It will be available for sponsorship again from ${new Date(sponsorship.endDate).toLocaleDateString()}.`
                )}
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

export function GestureDetail({
  gesture,
  isFavorite = false,
  onToggleFavorite,
  onBack,
  showOpenInApp = false,
  onOpenInApp,
}: GestureDetailProps) {
  const { t } = useTranslation();

  // Debug logging
  console.debug("GestureDetail render:", {
    showOpenInApp,
    hasOnOpenInApp: !!onOpenInApp,
    willShowBanner: !!showOpenInApp && !!onOpenInApp,
  });

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

  const handleOpenInAppClick = () => {
    if (onOpenInApp) {
      onOpenInApp();
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
              <span className="hidden sm:inline">
                {t("ui.gestureDetail.backToGestures")}
              </span>
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
                isFavorite
                  ? t("ui.gestureDetail.removeFromFavorites")
                  : t("ui.gestureDetail.addToFavorites")
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
                {isFavorite
                  ? t("ui.gestureDetail.removeFromFavorites")
                  : t("ui.gestureDetail.addToFavorites")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-4 md:px-6 md:py-6">
          {/* Open in App Banner (Mobile Only) */}
          {!!showOpenInApp && !!onOpenInApp && (
            <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <div>
                    <p
                      className="font-medium text-sm"
                      style={{ color: "var(--text)" }}
                    >
                      {t("ui.gestureDetail.openInApp")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t("ui.gestureDetail.betterExperience")}
                    </p>
                  </div>
                </div>
                <button
                  className="rounded-lg bg-primary px-4 py-2 font-medium text-sm text-white transition-all hover:bg-primary/90"
                  onClick={handleOpenInAppClick}
                  type="button"
                >
                  {t("ui.gestureDetail.open")}
                </button>
              </div>
            </div>
          )}

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

          {/* Video Player */}
          <div className="mb-6">
            <div
              className="overflow-hidden rounded-xl border border-border bg-card"
              style={{ aspectRatio: "3/4", maxHeight: "70vh" }}
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
                  style={{
                    width: "100%",
                    height: "100%",
                    aspectRatio: "3/4",
                    objectFit: "contain",
                  }}
                />
              </Suspense>
            </div>
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
                {t("ui.gestureDetail.description")}
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
                {t("ui.gestureDetail.relatedConcepts")}
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

          {/* Sponsorship Section */}
          {isAvailableForSponsorship ? (
            <SponsorshipCTA gestureId={gesture._id} t={t} />
          ) : null}

          {isActiveSponsorship === true &&
          gesture.sponsorship !== null &&
          gesture.sponsorship !== undefined ? (
            <SponsorshipInfo sponsorship={gesture.sponsorship} t={t} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
