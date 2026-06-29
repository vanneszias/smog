import MuxPlayer from "@mux/mux-player-react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ListPlus,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const VIDEO_COMPLETE_COUNT = 7;
const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";

// Link phrases that should be clickable in the video complete messages
const LINK_PHRASES = ["Klik hier", "klik dan hier"];

import { ShimmerSkeleton } from "../common/Skeleton";
import type { GestureCardData } from "./types";

export type GestureDetailData = GestureCardData & {
  sponsorship?: {
    status: string;
    sponsorName?: string;
    endDate?: number;
  } | null;
};

interface GestureDetailProps {
  gesture: GestureDetailData;
  isSaved?: boolean;
  onToggleSaved?: (gestureId: string) => void;
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

export function GestureDetail({
  gesture,
  isSaved = false,
  onToggleSaved,
  onBack,
  showOpenInApp = false,
  onOpenInApp,
}: GestureDetailProps) {
  const { t } = useTranslation();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const disclaimerFiredRef = useRef(false);

  // Randomly select a message index (1-7) when component mounts
  const messageIndex = useMemo(
    () => Math.floor(Math.random() * VIDEO_COMPLETE_COUNT) + 1,
    []
  );

  // Render message with clickable links
  const renderMessageWithLinks = (message: string) => {
    const parts: React.ReactNode[] = [];
    let remainingText = message;
    let keyIndex = 0;

    while (remainingText.length > 0) {
      let earliestMatch: { phrase: string; index: number } | null = null;

      // Find the earliest occurrence of any link phrase
      for (const phrase of LINK_PHRASES) {
        const index = remainingText.indexOf(phrase);
        if (
          index !== -1 &&
          (earliestMatch === null || index < earliestMatch.index)
        ) {
          earliestMatch = { phrase, index };
        }
      }

      if (earliestMatch) {
        // Add text before the link
        if (earliestMatch.index > 0) {
          parts.push(
            <span key={keyIndex++}>
              {remainingText.slice(0, earliestMatch.index)}
            </span>
          );
        }

        // Add the clickable link
        parts.push(
          <a
            className="underline underline-offset-2 transition-opacity hover:opacity-70"
            href={COURSE_URL}
            key={keyIndex++}
            rel="noopener noreferrer"
            style={{ color: "var(--primary)" }}
            target="_blank"
          >
            {earliestMatch.phrase}
          </a>
        );

        // Continue with remaining text
        remainingText = remainingText.slice(
          earliestMatch.index + earliestMatch.phrase.length
        );
      } else {
        // No more links, add remaining text
        parts.push(<span key={keyIndex++}>{remainingText}</span>);
        break;
      }
    }

    return parts;
  };

  const handleSaveClick = () => {
    if (onToggleSaved) {
      onToggleSaved(gesture._id);
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

          {/* Save-to-list button */}
          {onToggleSaved && (
            <button
              aria-label={
                isSaved
                  ? t(
                      "ui.gestureDetail.addToAnotherList",
                      "Add to another list"
                    )
                  : t("ui.gestureDetail.addToList", "Add to list")
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-all hover:scale-105 hover:bg-card md:h-auto md:w-auto md:gap-2 md:px-4 md:py-2"
              onClick={handleSaveClick}
              type="button"
            >
              {isSaved ? (
                <Check className="h-5 w-5 stroke-primary" />
              ) : (
                <ListPlus className="h-5 w-5 stroke-primary" />
              )}
              <span className="hidden font-medium md:inline">
                {isSaved
                  ? t(
                      "ui.gestureDetail.addToAnotherList",
                      "Add to another list"
                    )
                  : t("ui.gestureDetail.addToList", "Add to list")}
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
                  onEnded={() => {
                    // Reset the ref so the disclaimer fires again next play-through
                    disclaimerFiredRef.current = false;
                  }}
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget as HTMLVideoElement;
                    const timeLeft = el.duration - el.currentTime;
                    if (
                      !disclaimerFiredRef.current &&
                      Number.isFinite(timeLeft) &&
                      timeLeft <= 5 &&
                      timeLeft > 0
                    ) {
                      disclaimerFiredRef.current = true;
                      setShowDisclaimer(true);
                    }
                  }}
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

          {/* Disclaimer Banner */}
          {showDisclaimer && (
            <div
              className="fade-in slide-in-from-top-2 mb-6 animate-in rounded-xl border duration-300"
              style={{
                borderColor: "rgba(240, 200, 20, 0.35)",
                backgroundColor: "rgba(240, 200, 20, 0.07)",
              }}
            >
              <div className="flex items-start gap-3 p-4">
                {/* Amber accent left bar */}
                <div
                  className="mt-0.5 shrink-0 self-stretch rounded-full"
                  style={{
                    width: 3,
                    backgroundColor: "#F0C814",
                    minHeight: 20,
                  }}
                />

                {/* Icon */}
                <AlertTriangle
                  className="mt-0.5 shrink-0"
                  size={18}
                  style={{ color: "#C49A00" }}
                />

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p
                    className="mb-0.5 font-semibold text-sm leading-snug"
                    style={{ color: "var(--text)" }}
                  >
                    {t("gesture.disclaimer.titleNl")}
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text)" }}
                  >
                    {renderMessageWithLinks(
                      t(`gesture.videoComplete.${messageIndex}`)
                    )}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  aria-label="Dismiss disclaimer"
                  className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                  onClick={() => setShowDisclaimer(false)}
                  type="button"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}

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

          {/* Sponsorship Section - only show CTA when available, hide entirely when sponsored */}
          {isAvailableForSponsorship ? (
            <SponsorshipCTA gestureId={gesture._id} t={t} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
