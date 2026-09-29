export const PRICE_PER_GESTURE_YEAR_CENTS = 5000;
export const LOGO_ADDON_PER_GESTURE_CENTS = 1000;
export const SPONSORSHIP_DURATION_DAYS = 365;
export const MAX_GESTURES_PER_CHECKOUT = 10;
export const DISPLAY_NAME_MAX = 35;
export const VIDEO_COMPLETE_COUNT = 7;

export const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";
export const SMOG_WEBSITE_URL = "https://smog.vlaanderen";
export const CONTACT_EMAIL = "info@smog.vlaanderen";

export const RECENT_SEARCHES_MAX = 10;

export const LOCALES = ["nl", "en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "nl";
