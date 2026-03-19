/**
 * @fileoverview Full-details dialog for a single sponsorship.
 *
 * Opened from the detail panel via "View Full Details". Shows both videos
 * side-by-side plus all metadata in a structured grid.
 */

import MuxPlayer from "@mux/mux-player-react";
import { Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "./StatusBadge";
import type { Sponsorship } from "./types";

interface SponsorshipDetailsDialogProps {
  sponsorship: Sponsorship | null;
  onClose: () => void;
}

/**
 * Modal dialog showing full sponsorship metadata and both video players.
 */
export function SponsorshipDetailsDialog({
  sponsorship,
  onClose,
}: SponsorshipDetailsDialogProps) {
  if (!sponsorship) {
    return null;
  }

  return (
    <Dialog onOpenChange={onClose} open={!!sponsorship}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--admin-accent)]" />
            Sponsorship Details
          </DialogTitle>
          <DialogDescription>
            {sponsorship.gestureName || "Unknown Gesture"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                label: "Original Video",
                id: sponsorship.originalVideoPlaybackId,
              },
              {
                label: "Sponsored Video",
                id: sponsorship.sponsoredVideoPlaybackId,
              },
            ].map(({ label, id }) => (
              <div className="space-y-2" key={label}>
                <h4 className="font-medium text-[var(--admin-text)] text-sm">
                  {label}
                </h4>
                {id ? (
                  <>
                    <div className="overflow-hidden rounded-xl bg-[var(--admin-bg)]">
                      <MuxPlayer
                        loop
                        muted
                        playbackId={id}
                        streamType="on-demand"
                        style={{ width: "100%", aspectRatio: "16/9" }}
                      />
                    </div>
                    <code className="block truncate rounded-lg bg-[var(--admin-bg)] px-3 py-2 font-mono text-[var(--admin-text-muted)] text-xs">
                      {id}
                    </code>
                  </>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl bg-[var(--admin-bg)] text-[var(--admin-text-muted)] text-sm">
                    No {label.toLowerCase()}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-6">
            <div className="space-y-4">
              <div>
                <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                  Sponsor
                </p>
                <p className="text-[var(--admin-text)]">
                  {sponsorship.sponsorName}
                </p>
                <p className="text-[var(--admin-text-secondary)] text-sm">
                  {sponsorship.sponsorEmail}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                  Status
                </p>
                <StatusBadge status={sponsorship.status} />
              </div>
              <div>
                <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                  Overlay Text
                </p>
                <p className="text-[var(--admin-text)] italic">
                  "{sponsorship.overlayText}"
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Amount
                  </p>
                  <p className="font-semibold text-[var(--admin-text)] text-lg">
                    €{(sponsorship.paymentAmount / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Duration
                  </p>
                  <p className="font-semibold text-[var(--admin-text)] text-lg">
                    {sponsorship.durationYears}y
                  </p>
                </div>
              </div>
              {sponsorship.molliePaymentId && (
                <div>
                  <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                    Payment ID
                  </p>
                  <code className="block truncate rounded-lg bg-[var(--admin-card)] px-3 py-2 font-mono text-[var(--admin-text-secondary)] text-xs">
                    {sponsorship.molliePaymentId}
                  </code>
                </div>
              )}
              {sponsorship.status === "active" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                      Start Date
                    </p>
                    <p className="text-[var(--admin-text)]">
                      {new Date(sponsorship.startDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-[var(--admin-text-muted)] text-xs uppercase tracking-wide">
                      End Date
                    </p>
                    <p className="text-[var(--admin-text)]">
                      {new Date(sponsorship.endDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {sponsorship.rejectionReason && (
                <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
                  <p className="mb-1 font-medium text-red-600 text-xs dark:text-red-400">
                    Rejection Reason
                  </p>
                  <p className="text-red-600 text-sm dark:text-red-400">
                    {sponsorship.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between text-[var(--admin-text-muted)] text-xs">
            <span>
              Created: {new Date(sponsorship.createdAt).toLocaleString()}
            </span>
            <span>
              Updated: {new Date(sponsorship.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
