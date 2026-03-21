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
  gestureId: string;
  gestureName?: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageStorageId?: string;
  overlayText: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId?: string;
  previewVideoPlaybackId?: string;
  startDate: number;
  endDate: number;
  durationYears: number;
  status: string;
  molliePaymentId?: string;
  paymentAmount: number;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
  invoiceRequested?: boolean;
  invoiceName?: string;
  invoiceVatNumber?: string;
  invoiceEmail?: string;
  contactFullName?: string;
  contactCompany?: string;
  hasLogo?: boolean;
}

/** Per-status display configuration for badges and cards. */
export interface StatusDisplayConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
}
