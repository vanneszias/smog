import { DEFAULT_LOCALE } from "./locale";

interface LegacyRedirect {
  destination: string;
  permanent: true;
  source: string;
}

const home = `/${DEFAULT_LOCALE}`;

/**
 * The previous website's unprefixed URLs, each sent permanently (308) to the
 * page that replaced it in the default locale.
 *
 * They are still out there — in shared links, QR codes and search indexes —
 * and without these rows every one of them is a 404. Static rows in
 * `next.config.ts`'s `redirects()` are routing-table entries, so they cost no
 * bundled code; Next passes the query string through to the destination on
 * its own (`legacyRedirects.test.ts` pins that).
 *
 * `/gestures/<id>` is not here, because its destination depends on a
 * lookup: see `endpoints/legacy.ts`. `/lists/<token>` goes to the owner's
 * lists page rather than to a shared list, because the old lists were not
 * carried over and no old token names anything any more. `/admin` is
 * absent on purpose: it is Payload's admin, and still is.
 *
 * Imported by `next.config.ts`, so it imports nothing but `./locale`: every
 * dependency here is one more module the config has to load.
 */
export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  { destination: `${home}/gestures`, source: "/gestures" },
  { destination: `${home}/favorites`, source: "/favorites" },
  { destination: `${home}/account/lists`, source: "/lists" },
  { destination: `${home}/account/lists`, source: "/lists/:token" },
  { destination: `${home}/privacy`, source: "/privacy" },
  // No terms page exists; the home page is the nearest thing to one.
  { destination: home, source: "/terms" },
  { destination: `${home}/sponsor`, source: "/sponsor" },
  { destination: `${home}/sponsor`, source: "/sponsors" },
  { destination: `${home}/sponsor`, source: "/sponsors/re-edit" },
  { destination: `${home}/sponsor`, source: "/sponsors/success" },
  { destination: `${home}/sponsor`, source: "/success" },
  { destination: `${home}/account`, source: "/account" },
  { destination: `${home}/sign-in`, source: "/login" },
  // The old sign-in provider's return path; nothing signs in through it now.
  { destination: home, source: "/callback" },
].map((row) => ({ ...row, permanent: true as const }));
