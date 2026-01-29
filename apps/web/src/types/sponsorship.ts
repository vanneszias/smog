import type { Id } from "@smog/convex/dataModel";

/**
 * Sponsorship with enriched data (includes gestureName)
 * Returned by API endpoints like getSponsorshipsByPaymentId
 */
export interface SponsorshipWithGesture {
  _id: Id<"sponsorships">;
  _creationTime: number;
  gestureId: Id<"gestures">;
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
  hasLogo?: boolean;
  status: string;
  molliePaymentId?: string;
  paymentAmount: number;
  rejectionReason?: string;
  reviewedBy?: Id<"users">;
  reviewedAt?: number;
  contactFullName: string;
  contactCompany?: string;
  createdAt: number;
  updatedAt: number;
}
