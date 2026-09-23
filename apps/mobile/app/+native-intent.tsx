import { availableLocales } from "@smog/i18n";
import { REDIRECT_URI } from "@/lib/google";

/**
 * The site's gesture pages, as a universal link (iOS) or verified app link
 * (Android) hands them over — `https://app.smog.vlaanderen/nl/gestures/12`,
 * or just the path — plus the list at `/nl/gestures` itself. `app.json`'s
 * `associatedDomains` and `intentFilters`, and the site's `.well-known`
 * files, claim `/{locale}/gestures/*`; the OS hands over anything under it,
 * so the part after `gestures` (group 1) is checked here, not assumed.
 */
const GESTURES_URL = new RegExp(
  `^(?:https://app\\.smog\\.vlaanderen)?/(?:${availableLocales.join("|")})/gestures(/[^?#]*)?(\\?[^#]*)?(?:#.*)?$`,
  "i"
);

/** The app's search tab, `app/(tabs)/search.tsx`. */
const SEARCH = "/search";

/** Where a claimed URL the app has no screen for lands: the home tab. */
const HOME = "/";

/**
 * `.` or `..`, encoded or not. As a gesture id either would be collapsed out
 * of the API path the detail screen builds, so it is never routed as one.
 */
function isDotSegment(segment: string): boolean {
  let decoded = segment;

  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape is not a dot segment; the screen gets it as-is.
  }

  return decoded === "." || decoded === "..";
}

/**
 * Where an incoming URL lands in the app, before expo-router routes it.
 *
 * The site's gesture URLs carry a locale (`/nl/gestures/12`) and the app's
 * routes do not, so under the claimed prefix:
 *
 * - one id segment → `/gestures/12`, its query kept. The id is otherwise
 *   passed through as-is: the site only ever builds numeric ones, and the
 *   detail screen answers anything else as not found (`useGesture`), as it
 *   would a stale link. A `.` or `..` id goes home instead.
 * - the list itself (`/nl/gestures`, `/nl/gestures/`, with or without a
 *   `?q=`) → the search tab. The search screen reads no parameters, so the
 *   query is not carried over.
 * - anything deeper (`/nl/gestures/12/video`) → home. The site builds no such
 *   URL, and routed as-is it would open the unmatched-route screen.
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

  const match = GESTURES_URL.exec(path);

  if (match === null) {
    return path;
  }

  const segments = (match[1] ?? "").split("/").filter((part) => part !== "");
  const [id] = segments;

  if (id === undefined) {
    return SEARCH;
  }

  if (segments.length > 1 || isDotSegment(id)) {
    return HOME;
  }

  return `/gestures/${id}${match[2] ?? ""}`;
}
