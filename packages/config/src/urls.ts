/**
 * @fileoverview Centralised URL and external service endpoint configuration.
 *
 * All hardcoded URLs across the codebase should live here so they can be
 * updated in one place. Environment variables are used where the URL differs
 * between development and production.
 *
 * @example
 * import { MUX_IMAGE_DOMAIN, COURSE_URL } from "@smog/config/urls";
 */

// ─── Mux / Video CDN ──────────────────────────────────────────────────────────

/**
 * Mux image thumbnail domain.
 * Used to build gesture video thumbnail URLs.
 */
export const MUX_IMAGE_DOMAIN = "image.mux.com";

/**
 * Mux stream domain.
 * Used to build HLS video stream URLs.
 */
export const MUX_STREAM_DOMAIN = "stream.mux.com";

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * PostHog EU datacenter host.
 * Override with `EXPO_PUBLIC_POSTHOG_HOST` / `VITE_POSTHOG_HOST` for
 * US or self-hosted instances.
 */
export const POSTHOG_DEFAULT_HOST = "https://eu.i.posthog.com";

// ─── SMOG Website ─────────────────────────────────────────────────────────────

/**
 * URL of the course sign-up page shown in the DisclaimerBanner.
 *
 * Previously hardcoded in `apps/native/components/DisclaimerBanner.tsx`.
 */
export const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";

/**
 * Base URL of the SMOG marketing website.
 */
export const SMOG_WEBSITE_URL = "https://smog.vlaanderen";

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Default API base path for the Hono server.
 */
export const API_BASE_PATH = "/api";
