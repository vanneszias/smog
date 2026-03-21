/**
 * @fileoverview Test data factories for the SMOG monorepo.
 *
 * Provides `createGesture`, `createSponsorship`, `createCategory`, `createUser`
 * with sensible defaults that can be overridden per-test.
 *
 * These factories use inline minimal type definitions to avoid circular
 * dependencies between @smog/shared and @smog/types.
 *
 * @example
 * import { createGesture, createSponsorship } from "../__tests__/factories";
 *
 * const gesture = createGesture({ name: "Hello" });
 * const sponsorship = createSponsorship({ status: "pending_payment" });
 */

// ─── Inline minimal types (mirrors @smog/types without the dependency) ────────

export interface MockGesture {
  id: string;
  name: string;
  category: string[];
  playbackId: string;
  concept: string[];
  info: string;
}

export interface MockCategory {
  id: string;
  name: string;
  description?: string;
}

export type MockSponsorshipStatus =
  | "pending"
  | "pending_payment"
  | "pending_approval"
  | "pending_resubmission"
  | "active"
  | "expired"
  | "rejected"
  | "cancelled";

export interface MockSponsorship {
  id: string;
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayText: string;
  originalVideoPlaybackId: string;
  startDate: number;
  endDate: number;
  durationYears: number;
  status: MockSponsorshipStatus;
  paymentAmount: number;
  contactFullName: string;
  createdAt: number;
  updatedAt: number;
  hasLogo?: boolean;
  sponsoredVideoPlaybackId?: string;
  previewVideoPlaybackId?: string;
}

export interface MockUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

// ─── Counters for unique IDs ──────────────────────────────────────────────────

let _gestureCounter = 0;
let _sponsorshipCounter = 0;
let _categoryCounter = 0;
let _userCounter = 0;

/** Reset all ID counters. Call in `beforeEach` if ID uniqueness matters. */
export function resetFactoryCounters(): void {
  _gestureCounter = 0;
  _sponsorshipCounter = 0;
  _categoryCounter = 0;
  _userCounter = 0;
}

// ─── Gesture factory ──────────────────────────────────────────────────────────

/**
 * Create a mock gesture with sensible defaults.
 *
 * @example
 * const g = createGesture({ name: "Hello", category: ["Greetings"] });
 */
export function createGesture(
  overrides: Partial<MockGesture> = {}
): MockGesture {
  const id = ++_gestureCounter;
  return {
    id: `gesture_${id}`,
    name: `Test Gesture ${id}`,
    category: ["Test Category"],
    playbackId: `playback_${id}`,
    concept: [`concept_${id}`],
    info: `Description of gesture ${id}`,
    ...overrides,
  };
}

/**
 * Create an array of mock gestures.
 *
 * @param count - How many gestures to create.
 * @param overrides - Applied to each gesture.
 */
export function createGestures(
  count: number,
  overrides: Partial<MockGesture> = {}
): MockGesture[] {
  return Array.from({ length: count }, () => createGesture(overrides));
}

// ─── Category factory ─────────────────────────────────────────────────────────

/**
 * Create a mock category.
 */
export function createCategory(
  overrides: Partial<MockCategory> = {}
): MockCategory {
  const id = ++_categoryCounter;
  return {
    id: `category_${id}`,
    name: `Category ${id}`,
    ...overrides,
  };
}

// ─── Sponsorship factory ──────────────────────────────────────────────────────

/**
 * Create a mock sponsorship with sensible defaults.
 *
 * @example
 * const s = createSponsorship({ status: "pending_approval" });
 */
export function createSponsorship(
  overrides: Partial<MockSponsorship> = {}
): MockSponsorship {
  const id = ++_sponsorshipCounter;
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;

  return {
    id: `sponsorship_${id}`,
    gestureId: `gesture_${id}`,
    sponsorName: `Test Sponsor ${id}`,
    sponsorEmail: `sponsor${id}@example.com`,
    overlayText: `Met de steun van: Test Sponsor ${id}`,
    originalVideoPlaybackId: `original_${id}`,
    startDate: now,
    endDate: now + oneYear,
    durationYears: 1,
    status: "active" as MockSponsorshipStatus,
    paymentAmount: 5000,
    contactFullName: `Contact Person ${id}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── User factory ─────────────────────────────────────────────────────────────

/**
 * Create a mock user.
 */
export function createUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = ++_userCounter;
  return {
    id: `user_${id}`,
    email: `user${id}@example.com`,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    ...overrides,
  };
}
