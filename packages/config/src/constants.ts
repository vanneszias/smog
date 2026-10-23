export const PRICE_PER_GESTURE_YEAR_CENTS = 5000;
export const LOGO_ADDON_PER_GESTURE_CENTS = 1000;
export const SPONSORSHIP_DURATION_DAYS = 365;
export const MAX_GESTURES_PER_CHECKOUT = 10;
export const DISPLAY_NAME_MAX = 35;
export const VIDEO_COMPLETE_COUNT = 7;

export const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";
export const SMOG_WEBSITE_URL = "https://smog.vlaanderen";
export const CONTACT_EMAIL = "info@smog.vlaanderen";

/** The app's store pages (the old site's banner, inventory L-16). */
export const APP_STORE_URL = "https://apps.apple.com/app/smog-co/id6758547774";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=be.zias.smog";
/** The app's URL scheme and Android package (`apps/mobile/app.config.ts`). */
export const APP_SCHEME = "smog";
export const ANDROID_PACKAGE = "be.zias.smog";

export const RECENT_SEARCHES_MAX = 10;

/** Gestures kept for "continue where you left off" (on the device only). */
export const RECENT_GESTURES_MAX = 6;

/**
 * The languages that ship a catalogue in the bundle: the seed of the
 * `language` table and the offline base of the apps (phase 10b ruling 1).
 */
export const LOCALES = ["nl", "en", "fr"] as const;
export type ShippedLocale = (typeof LOCALES)[number];
/**
 * A language code. Languages are data (phase 10b ruling 2): the shipped ones
 * and every language an admin adds, validated against the `language` table
 * at the edges (`resolveLocale`, the cookie, profile and checkout writes).
 */
export type Locale = string;
/** The shipped default; the database's `language.is_default` row names the same one. */
export const DEFAULT_LOCALE = "nl";

/** The shape of a language code (BCP-47: `nl`, `fr`, `pt-BR`), before it is looked up. */
export const LOCALE_CODE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
export const LOCALE_CODE_MAX_LENGTH = 35;

/**
 * The privacy policy version a consent decision refers to
 * (`consent_event.policy_version`). Bump it with every policy change.
 */
export const CONSENT_POLICY_VERSION = "2026-09-29";

/**
 * The origin the production app is built for (`apps/mobile/eas.json`'s
 * production profile; phase 8 ruling 3). It equals production's `SITE_URL`
 * on the workers.dev path; on the domain path the owner may move it first,
 * for an app review on the domain (the cutover runbook).
 * `scripts/release-config-check.ts` holds the profile to it, and warns while
 * it differs from `SITE_URL`.
 */
export const PRODUCTION_LAUNCH_ORIGIN =
  "https://smog-site-production.zias.workers.dev";
