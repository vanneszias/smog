/**
 * The language the app asks the server for (phase 10b task 5): the stored
 * choice, else the device's first language. The gesture catalogue answers
 * in the request's language (`Accept-Language` here, the cookie on the web),
 * and the server uses the closest enabled language. A module value, not
 * React state: the api client reads it per request, outside the tree.
 */
let requested: string | null = null;

/** The language to ask for, or `null` to send none (the server's default). */
export function setRequestedLocale(tag: string | null): void {
  requested = tag;
}

/** The headers that carry it. */
export function languageHeaders(): Record<string, string> {
  return requested ? { "accept-language": requested } : {};
}
