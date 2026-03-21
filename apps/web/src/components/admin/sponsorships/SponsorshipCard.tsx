/**
 * @fileoverview Selectable sponsorship thumbnail card for the admin grid.
 */

import { Calendar, Euro } from "lucide-react";
import { statusConfig } from "./statusConfig";
import type { Sponsorship } from "./types";

interface SponsorshipCardProps {
  sponsorship: Sponsorship;
  isSelected: boolean;
  onClick: () => void;
}

/** Thumbnail card for the sponsorship grid — shows video preview, status, and key info. */
export function SponsorshipCard({
  sponsorship,
  isSelected,
  onClick,
}: SponsorshipCardProps) {
  const config = statusConfig[sponsorship.status] ?? statusConfig.pending;

  return (
    <button
      className={`group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/5 ring-2 ring-[var(--admin-accent)]/20"
          : "border-[var(--admin-border)] bg-[var(--admin-card)] hover:border-[var(--admin-accent)]/30 hover:shadow-md"
      }`}
      onClick={onClick}
      type="button"
    >
      {/* Video Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-[var(--admin-bg)]">
        <img
          alt={sponsorship.gestureName || "Gesture"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          height={135}
          loading="lazy"
          src={`https://image.mux.com/${sponsorship.sponsoredVideoPlaybackId || sponsorship.originalVideoPlaybackId}/thumbnail.webp?width=320&height=180&time=1`}
          width={320}
        />
        <div
          className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs backdrop-blur-sm ${config.bgColor} ${config.color}`}
        >
          <config.icon className="h-3 w-3" />
          {config.label}
        </div>
        {isSelected && (
          <div className="absolute top-2 right-2 h-3 w-3 rounded-full border-2 border-white bg-[var(--admin-accent)] shadow-md" />
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="mb-1 truncate font-semibold text-[var(--admin-text)] text-sm">
          {sponsorship.gestureName || "Unknown Gesture"}
        </h3>
        <p className="mb-3 truncate text-[var(--admin-text-muted)] text-xs">
          {sponsorship.sponsorName}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-secondary)] text-xs">
            <Euro className="h-3 w-3" />
            {(sponsorship.paymentAmount / 100).toFixed(0)}
          </span>
          <span className="flex items-center gap-1 rounded-md bg-[var(--admin-bg)] px-2 py-0.5 text-[var(--admin-text-secondary)] text-xs">
            <Calendar className="h-3 w-3" />
            {sponsorship.durationYears}y
          </span>
        </div>
      </div>
    </button>
  );
}
