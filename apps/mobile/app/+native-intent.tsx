/**
 * Where an incoming link lands, before expo-router routes it (spec §10).
 *
 * Links arrive as universal/app links (`https://<site host>/gestures/hond`,
 * claimed in `app.config.ts`), as `smog://…` links, or as a bare path. The
 * site's URLs have no locale prefix, so the mapping is:
 *
 * - `/gestures/<slug|legacyId>` → the gesture screen (the screen resolves
 *   a legacy id through `gestures.bySlug`)
 * - `/lists/<token>` → the shared list screen (`/shared/<token>`)
 * - `/gestures?q=&category=` → the search tab, with the query and filter
 * - `/magic-link/app?token=&email=` (the app's magic link, https or
 *   `smog://`) → the magic-link screen with the token and address only; a
 *   malformed one opens it without them. `/magic-link` itself is not
 *   mapped: no legitimate sender uses it.
 * - the app's own routes (`/`, `/search`, `/favorites`, `/lists`,
 *   `/shared/<token>`, `/settings`, the sign-in screens) → themselves
 * - anything else, deeper paths, dot segments and malformed escapes → home
 *
 * It never throws: a throw here is a crash at launch.
 */

import { MAGIC_LINK_TOKEN_PATTERN } from "@smog/auth/react";

const HOME = "/";

/** The screens a link may open as-is (one segment, no parameters). */
const PLAIN_ROUTES = new Set([
  "favorites",
  "forgot-password",
  "lists",
  "settings",
  "sign-in",
  "sign-up",
]);

/** `gestures.search` takes at most 100 characters (the contract). */
const QUERY_MAX = 100;

const SCHEME_NAME = /^[a-z][a-z0-9+.-]*$/i;
const AUTHORITY_END = /[/?#]/;
const LEADING_SLASHES = /^\/+/;

/** `https://host/path?q` → `/path?q`; `undefined` without a host. */
function afterAuthority(rest: string): string | undefined {
  if (!rest.startsWith("//")) {
    return;
  }
  const authority = rest.slice(2);
  const end = authority.search(AUTHORITY_END);
  if (authority === "" || end === 0) {
    return;
  }
  if (end === -1) {
    return "/";
  }
  const path = authority.slice(end);
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * The path (and query) of `link` inside the app, or `undefined` when the
 * link is not one the app understands.
 */
function appPath(link: string): string | undefined {
  const colon = link.indexOf(":");
  const scheme = colon > 0 ? link.slice(0, colon) : "";
  if (!SCHEME_NAME.test(scheme)) {
    return link.startsWith("/") ? link : undefined;
  }
  const name = scheme.toLowerCase();
  const rest = link.slice(colon + 1);
  if (name === "https" || name === "http") {
    return afterAuthority(rest);
  }
  if (name === "smog") {
    // `smog://gestures/x`: the "host" is the first path segment.
    return `/${rest.replace(LEADING_SLASHES, "")}`;
  }
  if (name === "exp" || name === "exps") {
    // A development build: `exp://<host>:<port>/--/<path>`.
    const marker = rest.indexOf("/--/");
    return marker === -1 ? undefined : rest.slice(marker + 3);
  }
}

function isDotSegment(segment: string): boolean {
  return segment === "." || segment === "..";
}

/** `a=1&b=2` as decoded pairs (`+` is a space); throws on a bad escape. */
function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of query.split("&")) {
    if (!part) {
      continue;
    }
    const [key = "", ...value] = part.split("=");
    const decode = (text: string): string =>
      decodeURIComponent(text.replaceAll("+", " "));
    params.set(decode(key), decode(value.join("=")));
  }
  return params;
}

/** The search tab with the query and category filter a link carried. */
function searchPath(query: string): string {
  const params = parseQuery(query);
  const q = (params.get("q") ?? "").trim().slice(0, QUERY_MAX);
  const category = (params.get("category") ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
    .join(",");
  const search = [
    ...(q ? [`q=${encodeURIComponent(q)}`] : []),
    ...(category ? [`category=${encodeURIComponent(category)}`] : []),
  ].join("&");
  return search ? `/search?${search}` : "/search";
}

/** An address as the server puts it in the link (loosely checked). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

/** The magic-link screen, with the link's token and address when valid. */
function magicLinkPath(query: string): string {
  const params = parseQuery(query);
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  return MAGIC_LINK_TOKEN_PATTERN.test(token) &&
    email.length <= EMAIL_MAX &&
    EMAIL_PATTERN.test(email)
    ? `/magic-link?token=${token}&email=${encodeURIComponent(email)}`
    : "/magic-link";
}

function route(path: string): string {
  const [withoutHash = ""] = path.split("#");
  const queryStart = withoutHash.indexOf("?");
  const pathname =
    queryStart === -1 ? withoutHash : withoutHash.slice(0, queryStart);
  const query = queryStart === -1 ? "" : withoutHash.slice(queryStart + 1);
  const segments = pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => decodeURIComponent(segment));
  if (segments.some(isDotSegment)) {
    return HOME;
  }
  const [first, second, ...deeper] = segments;
  if (first === undefined) {
    return HOME;
  }
  if (deeper.length > 0) {
    return HOME;
  }
  if (first === "magic-link" && second === "app") {
    return magicLinkPath(query);
  }
  if (second === undefined) {
    if (first === "gestures" || first === "search") {
      return searchPath(query);
    }
    return PLAIN_ROUTES.has(first) ? `/${first}` : HOME;
  }
  const id = encodeURIComponent(second);
  if (first === "gestures") {
    return `/gestures/${id}`;
  }
  if (first === "lists" || first === "shared") {
    return `/shared/${id}`;
  }
  return HOME;
}

export function redirectSystemPath({
  path,
}: {
  initial: boolean;
  path: string;
}): string {
  try {
    if (typeof path !== "string") {
      return HOME;
    }
    const inApp = appPath(path);
    return inApp === undefined ? HOME : route(inApp);
  } catch {
    // A malformed escape (or anything else): home, never a crash.
    return HOME;
  }
}
