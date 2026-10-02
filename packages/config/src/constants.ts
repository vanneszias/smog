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

export const LOCALES = ["nl", "en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "nl";

/**
 * The privacy policy version a consent decision refers to
 * (`consent_event.policy_version`). Bump it with every policy change.
 */
export const CONSENT_POLICY_VERSION = "2026-09-29";
