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
  /** Company name (optional) */
  contactCompany?: string;
  /** Full name of the contact person who placed the order */
  contactFullName: string;
  createdAt: number;
  /** Always 1 in the simplified flow */
  durationYears: number;
  /** Unix timestamp (ms) when sponsorship expires */
  endDate: number;
  gestureId: string;
  /** Whether the sponsor paid for the logo overlay add-on */
  hasLogo?: boolean;
  id: string;
  molliePaymentId?: string;
  originalVideoPlaybackId: string;
  overlayImageStorageId?: string;
  overlayText: string;
  paymentAmount: number;
  previewVideoPlaybackId?: string;
  sponsorEmail: string;
  sponsoredVideoPlaybackId?: string;
  sponsoredVideoStorageId?: string;
  sponsorName: string;
  /** Unix timestamp (ms) when sponsorship becomes active */
  startDate: number;
  status: SponsorshipStatus;
  updatedAt: number;
}

/**
 * Sponsorship enriched with the gesture name for display purposes.
 * Returned by API endpoints such as `getSponsorshipsByPaymentId`.
 */
export interface SponsorshipWithGesture extends Omit<Sponsorship, "id"> {
  _creationTime: number;
  /** Convex document ID */
  _id: string;
  gestureName?: string;
  rejectionReason?: string;
}

// ===== INPUT TYPES =====

/**
 * Input shape for creating a new sponsorship through the wizard.
 */
export interface CreateSponsorshipInput {
  contactCompany?: string;
  contactFullName: string;
  durationYears: number;
  gestureId: string;
  includeLogo: boolean;
  overlayImageFile?: File;
  overlayText: string;
  sponsorEmail: string;
  sponsorName: string;
}

// ===== PRICING TYPES =====

/**
 * Computed pricing breakdown for a sponsorship order.
 */
export interface SponsorshipPricing {
  durationYears: number;
  gestureCount: number;
  includeLogo: boolean;
  logoAddonCents: number;
  pricePerGestureCents: number;
  subtotalCents: number;
  totalCents: number;
}

// ===== OVERLAY TYPES =====

/**
 * Overlay configuration for rendering a sponsor's logo and text on a video.
 * All coordinates are relative percentages of the video dimensions (0–100).
 */
export interface OverlayConfig {
  /** Fade-in animation properties */
  animation: {
    /** Seconds from the end of the video at which to show the overlay */
    startTime: number;
    /** Duration of the fade-in in seconds */
    fadeInDuration: number;
  };
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
}

/**
 * Default overlay configuration matching the current production values.
 * Centered logo with two-line text layout.
 */
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  animation: {
    fadeInDuration: 1,
    startTime: 5,
  },
  image: {
    height: 22,
    width: 22,
    x: 50,
    y: 76,
  },
  text: {
    color: "#00805f",
    fontSize: 3.8,
    x: 50,
    y: 87,
  },
};
