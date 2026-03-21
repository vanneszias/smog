/**
 * @fileoverview Sponsorship domain types
 *
 * All types related to the sponsorship purchase flow, sponsorship records,
 * overlay configuration, and pricing.
 */

// ===== STATUS TYPES =====

/**
 * All possible lifecycle states a sponsorship can be in.
 *
 * State machine:
 *   pending → pending_payment → pending_approval → active → expired
 *                                               ↘ rejected
 *                                               ↘ pending_resubmission → pending_approval
 *   Any state → cancelled
 */
export type SponsorshipStatus =
  | "pending"
  | "pending_payment"
  | "pending_approval"
  | "pending_resubmission"
  | "active"
  | "expired"
  | "rejected"
  | "cancelled";

// ===== RECORD TYPES =====

/**
 * A fully-resolved sponsorship record as stored in Convex.
 */
export interface Sponsorship {
  id: string;
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageStorageId?: string;
  overlayText: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId: string;
  sponsoredVideoStorageId?: string;
  previewVideoPlaybackId?: string;
  /** Unix timestamp (ms) when sponsorship becomes active */
  startDate: number;
  /** Unix timestamp (ms) when sponsorship expires */
  endDate: number;
  /** Always 1 in the simplified flow */
  durationYears: number;
  /** Whether the sponsor paid for the logo overlay add-on */
  hasLogo?: boolean;
  /** Full name of the contact person who placed the order */
  contactFullName: string;
  /** Company name (optional) */
  contactCompany?: string;
  status: SponsorshipStatus;
  molliePaymentId?: string;
  paymentAmount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Sponsorship enriched with the gesture name for display purposes.
 * Returned by API endpoints such as `getSponsorshipsByPaymentId`.
 */
export interface SponsorshipWithGesture extends Omit<Sponsorship, "id"> {
  /** Convex document ID */
  _id: string;
  _creationTime: number;
  gestureName?: string;
  rejectionReason?: string;
}

// ===== INPUT TYPES =====

/**
 * Input shape for creating a new sponsorship through the wizard.
 */
export interface CreateSponsorshipInput {
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  contactFullName: string;
  contactCompany?: string;
  overlayImageFile?: File;
  overlayText: string;
  durationYears: number;
  includeLogo: boolean;
}

// ===== PRICING TYPES =====

/**
 * Computed pricing breakdown for a sponsorship order.
 */
export interface SponsorshipPricing {
  gestureCount: number;
  includeLogo: boolean;
  pricePerGestureCents: number;
  logoAddonCents: number;
  subtotalCents: number;
  totalCents: number;
  durationYears: number;
}

// ===== OVERLAY TYPES =====

/**
 * Overlay configuration for rendering a sponsor's logo and text on a video.
 * All coordinates are relative percentages of the video dimensions (0–100).
 */
export interface OverlayConfig {
  /** Image overlay properties */
  image: {
    /** X position as % of video width (0–100) */
    x: number;
    /** Y position as % of video height (0–100) */
    y: number;
    /** Width as % of video width (0–100) */
    width: number;
    /** Height as % of video height (0–100) */
    height: number;
  };
  /** Text overlay properties */
  text: {
    /** X position as % of video width (0–100) */
    x: number;
    /** Y position as % of video height (0–100) */
    y: number;
    /** Font size as % of video height (0–20) */
    fontSize: number;
    /** Hex color string, e.g. "#000000" */
    color: string;
  };
  /** Fade-in animation properties */
  animation: {
    /** Seconds from the end of the video at which to show the overlay */
    startTime: number;
    /** Duration of the fade-in in seconds */
    fadeInDuration: number;
  };
}

/**
 * Default overlay configuration matching the current production values.
 * Centered logo with two-line text layout.
 */
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  image: {
    x: 50,
    y: 76,
    width: 22,
    height: 22,
  },
  text: {
    x: 50,
    y: 87,
    fontSize: 3.8,
    color: "#00805f",
  },
  animation: {
    startTime: 5,
    fadeInDuration: 1,
  },
};
