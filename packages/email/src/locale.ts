import { type Locale, resolveLocale } from "@smog/i18n";

/**
 * The language of an email: the user's saved locale, else the request's
 * Accept-Language, else `nl`.
 */
export function emailLocale({
  request,
  userLocale,
}: {
  request?: Request | undefined;
  userLocale?: string | null | undefined;
}): Locale {
  return resolveLocale({
    acceptLanguage: request?.headers.get("accept-language"),
    preference: userLocale,
  });
}
