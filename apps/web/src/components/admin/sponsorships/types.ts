/**
 * @fileoverview Types for the sponsorships admin module.
 *
 * The `Sponsorship` type is intentionally permissive — the admin API returns
 * Convex documents whose shape evolves over time, so optional fields are used
 * throughout rather than strict required fields.
 */

/** Admin-facing sponsorship record shape. */
export interface Sponsorship {
  _id: string;
  contactCompany?: string;
  contactFullName?: string;
  createdAt: number;
  durationYears: number;
  endDate: number;
  gestureId: string;
  gestureName?: string;
  hasLogo?: boolean;
  invoiceEmail?: string;
  invoiceName?: string;
  invoiceRequested?: boolean;
  invoiceVatNumber?: string;
  molliePaymentId?: string;
  originalVideoPlaybackId?: string;
  overlayImageStorageId?: string;
  overlayText: string;
  paymentAmount: number;
  previewVideoPlaybackId?: string;
  rejectionReason?: string;
  reviewedAt?: number;
  reviewedBy?: string;
  sponsorEmail: string;
  sponsoredVideoPlaybackId?: string;
  sponsorName: string;
  startDate: number;
  status: string;
  updatedAt: number;
}

/** Per-status display configuration for badges and cards. */
export interface StatusDisplayConfig {
  bgColor: string;
  color: string;
  icon: React.ElementType;
  label: string;
}
