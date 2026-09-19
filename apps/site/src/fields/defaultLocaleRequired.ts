import type { Validate } from "payload";

const DEFAULT_LOCALE = "nl";

/**
 * The Dutch (`nl`) value is the source of truth; translations are optional.
 * A field-level `required: true` would validate per-locale and block saving
 * a document at all in `en`/`fr` until it has its own translation — which
 * would make the admin panel unusable in two of three locales, since the
 * migration plan starts `en` and `fr` empty. So `required` is enforced only
 * for the default locale, via this validator, instead of at the field level.
 *
 * Works for both single-value fields (text, textarea — value is a string)
 * and `hasMany` fields (value is an array), since Payload calls `validate`
 * with whatever shape that field produces.
 */
export function defaultLocaleRequired<TValue = unknown>(
  message: string
): Validate<TValue> {
  return (value, { req }) => {
    if (req.locale && req.locale !== DEFAULT_LOCALE) {
      return true;
    }

    const isEmpty = Array.isArray(value)
      ? value.length === 0
      : typeof value !== "string" || value.trim() === "";

    return isEmpty ? message : true;
  };
}
