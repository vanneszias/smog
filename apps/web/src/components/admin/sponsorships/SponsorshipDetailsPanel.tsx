/**
 * @fileoverview Sticky detail panel for the selected sponsorship.
 *
 * Shows video preview, key metadata, invoice info, action buttons.
 * Displayed in the right column of the master-detail layout.
 */

import MuxPlayer from "@mux/mux-player-react";
import {
  AlertCircle,
  Banknote,
  Eye,
  FileText,
  Link,
  Mail,
  Timer,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReEditLinkBox } from "./ReEditLinkBox";
import { StatusBadge } from "./StatusBadge";
import type { Sponsorship } from "./types";

interface SponsorshipDetailsPanelProps {
  sponsorship: Sponsorship;
  onViewDetails: () => void;
  onForceExpire: () => void;
  onGenerateReEditLink: () => void;
  onMarkPaidManually: () => void;
  onCancelPendingPayment: () => void;
  isExpiring: boolean;
  isGeneratingReEditLink: boolean;
  isMarkingPaid: boolean;
  isCancelling: boolean;
}

/**
 * Sticky right-column panel showing the selected sponsorship's details and actions.
 */
export function SponsorshipDetailsPanel({
  sponsorship,
  onViewDetails,
  onForceExpire,
  onGenerateReEditLink,
  onMarkPaidManually,
  onCancelPendingPayment,
  isExpiring,
  isGeneratingReEditLink,
  isMarkingPaid,
  isCancelling,
}: SponsorshipDetailsPanelProps) {
  return (
    <div className="sticky top-24 space-y-4 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4">
      <div className="overflow-hidden rounded-xl">
        <MuxPlayer
          loop
          muted
          playbackId={
            sponsorship.sponsoredVideoPlaybackId ||
            sponsorship.originalVideoPlaybackId
          }
          streamType="on-demand"
          style={{ width: "100%", aspectRatio: "16/9" }}
        />
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-[var(--admin-text)] text-lg">
            {sponsorship.gestureName || "Unknown Gesture"}
          </h3>
          <div className="mt-2">
            <StatusBadge status={sponsorship.status} />
          </div>
        </div>

        <div className="space-y-2 rounded-lg bg-[var(--admin-card)] p-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-[var(--admin-text-muted)]" />
            <span className="text-[var(--admin-text)]">
              {sponsorship.sponsorName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-[var(--admin-text-muted)]" />
            <span className="text-[var(--admin-text-secondary)]">
              {sponsorship.sponsorEmail}
            </span>
          </div>
          {sponsorship.contactFullName && (
            <div className="border-[var(--admin-border)] border-t pt-2 text-sm">
              <p className="mb-0.5 text-[var(--admin-text-muted)] text-xs">
                Contactpersoon
              </p>
              <p className="text-[var(--admin-text)]">
                {sponsorship.contactFullName}
                {sponsorship.contactCompany
                  ? ` — ${sponsorship.contactCompany}`
                  : ""}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1 rounded-lg bg-[var(--admin-card)] p-3">
            <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
              Amount
            </p>
            <p className="font-semibold text-[var(--admin-text)]">
              €{(sponsorship.paymentAmount / 100).toFixed(2)}
            </p>
          </div>
          <div className="flex-1 rounded-lg bg-[var(--admin-card)] p-3">
            <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
              Duration
            </p>
            <p className="font-semibold text-[var(--admin-text)]">
              {sponsorship.durationYears} year
              {sponsorship.durationYears !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div
          className={`space-y-2 rounded-lg border p-3 ${
            sponsorship.invoiceRequested
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-[var(--admin-border)] bg-[var(--admin-card)]"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 font-medium text-xs uppercase tracking-wide ${
              sponsorship.invoiceRequested
                ? "text-amber-600"
                : "text-[var(--admin-text-muted)]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {sponsorship.invoiceRequested ? "Factuur gevraagd" : "Geen factuur"}
          </p>
          {sponsorship.invoiceRequested && (
            <div className="space-y-1 text-sm">
              {sponsorship.invoiceName && (
                <div className="flex items-start gap-2">
                  <span className="w-20 shrink-0 text-[var(--admin-text-muted)] text-xs">
                    Naam
                  </span>
                  <span className="text-[var(--admin-text)]">
                    {sponsorship.invoiceName}
                  </span>
                </div>
              )}
              {sponsorship.invoiceVatNumber && (
                <div className="flex items-start gap-2">
                  <span className="w-20 shrink-0 text-[var(--admin-text-muted)] text-xs">
                    Ond.nr.
                  </span>
                  <span className="font-mono text-[var(--admin-text)]">
                    {sponsorship.invoiceVatNumber}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="w-20 shrink-0 text-[var(--admin-text-muted)] text-xs">
                  E-mail
                </span>
                <span className="text-[var(--admin-text)]">
                  {sponsorship.invoiceEmail || sponsorship.sponsorEmail}
                </span>
              </div>
            </div>
          )}
        </div>

        {sponsorship.status === "active" && (
          <div className="rounded-lg bg-[var(--admin-card)] p-3">
            <p className="mb-1 text-[var(--admin-text-muted)] text-xs">
              Expires
            </p>
            <p className="font-medium text-[var(--admin-text)]">
              {new Date(sponsorship.endDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}

        {sponsorship.status === "pending_resubmission" && (
          <ReEditLinkBox sponsorshipId={sponsorship._id} />
        )}

        {sponsorship.rejectionReason && (
          <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="mb-1 font-medium text-red-600 text-xs dark:text-red-400">
                  Rejection Reason
                </p>
                <p className="text-red-600 text-sm dark:text-red-400">
                  {sponsorship.rejectionReason}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1 text-[var(--admin-text-muted)] text-xs">
          <p>Created: {new Date(sponsorship.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(sponsorship.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="space-y-2 border-[var(--admin-border)] border-t pt-4">
        <Button
          className="w-full gap-2"
          onClick={onViewDetails}
          variant="outline"
        >
          <Eye className="h-4 w-4" />
          View Full Details
        </Button>

        {sponsorship.status === "pending_payment" && (
          <>
            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={isMarkingPaid}
              onClick={onMarkPaidManually}
            >
              <Banknote className="h-4 w-4" />
              {isMarkingPaid ? "Marking as Paid..." : "Mark as Paid Manually"}
            </Button>
            <Button
              className="w-full gap-2"
              disabled={isCancelling}
              onClick={onCancelPendingPayment}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              {isCancelling ? "Cancelling..." : "Cancel (No Payment)"}
            </Button>
          </>
        )}

        {sponsorship.status === "active" && (
          <Button
            className="w-full gap-2"
            disabled={isExpiring}
            onClick={onForceExpire}
            variant="destructive"
          >
            <Timer className="h-4 w-4" />
            {isExpiring ? "Expiring..." : "Force Expire"}
          </Button>
        )}

        {(sponsorship.status === "pending_approval" ||
          sponsorship.status === "pending_resubmission" ||
          sponsorship.status === "rejected") && (
          <Button
            className="w-full gap-2"
            disabled={isGeneratingReEditLink}
            onClick={onGenerateReEditLink}
            variant="outline"
          >
            <Link className="h-4 w-4" />
            {isGeneratingReEditLink
              ? "Generating..."
              : sponsorship.status === "pending_resubmission"
                ? "Regenerate Re-edit Link"
                : "Let Sponsor Re-edit"}
          </Button>
        )}
      </div>
    </div>
  );
}
