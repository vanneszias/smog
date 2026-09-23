import { availableLocales } from "@smog/i18n";
import { REDIRECT_URI } from "@/lib/google";

/**
 * A gesture page on the site, as a universal link (iOS) or verified app link
 * (Android) hands it over: `https://app.smog.vlaanderen/nl/gestures/12`, or
 * just its path. `app.json`'s `associatedDomains` and `intentFilters`, and
 * the site's `.well-known` files, claim exactly these paths.
 */
const GESTURE_PAGE = new RegExp(
  `^(?:https://app\\.smog\\.vlaanderen)?/(?:${availableLocales.join("|")})/gestures/([^/?#]+)/?(\\?[^#]*)?(?:#.*)?$`,
  "i"
);

/**
 * Where an incoming URL lands in the app, before expo-router routes it.
 *
 * The site's gesture URLs carry a locale (`/nl/gestures/12`) and the app's
 * route does not (`app/gestures/[id].tsx`), so a link to a gesture page is
 * rewritten to `/gestures/12`, its query kept. The id is passed through
 * as-is: the site only ever builds numeric ones, and one that names nothing
 * gets the detail screen's own load error, as a stale link would.
 *
 * The Google sign-in return, {@link REDIRECT_URI}, answers `null`, which
 * tells expo-router not to navigate at all. That URL belongs to
 * `openAuthSessionAsync` (`lib/google.ts`), which consumes it to finish the
 * sign-in, but on Android it also arrives as an ordinary incoming link.
 * Returned unchanged, expo-router would navigate to it — to
 * `/auth-callback`, which is no route in this app — and open the unmatched
 * route screen over the sign-in the app is in the middle of finishing.
 *
 * Every other URL is returned unchanged, for expo-router to route as it
 * would without this file. Nothing here can throw: a throw from this
 * function is a crash at launch.
 */
export function redirectSystemPath({
  path,
}: {
  initial: boolean;
  path: string;
}): string | null {
  if (path.startsWith(REDIRECT_URI)) {
    return null;
  }

  const match = GESTURE_PAGE.exec(path);

  if (match === null) {
    return path;
  }

  return `/gestures/${match[1]}${match[2] ?? ""}`;
}
