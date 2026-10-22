import { slugify } from "@smog/utils";

/**
 * The old site's URLs that moved (spec §9, inventory §7). Each one answers
 * 301 with its query string, except the token links (below). Destinations are fixed paths on this site, so
 * no input can turn a redirect into an open one.
 *
 * `/lists/<token>` keeps its tokens, so it is not here. `/favorites` and
 * `/lists` moved into My space (`/my`, phase 10a task 4): a 302, not a 301,
 * because the destination is a product decision, not an old URL. An old `/gestures/<convexId>` is resolved by the
 * gesture route itself (`gesture.legacy_id`, it needs D1).
 */
export interface LegacyRedirect {
  /** The old path, matched exactly (a trailing slash is ignored). */
  from: string;
  /** `/sponsors/<rest>` → `/sponsor/<rest>`: the rest of the path carries over. */
  prefix?: true;
  /** `drop` leaves the old query behind (`/callback` held a spent OAuth code). */
  query?: "drop";
  /** Query params that were renamed: `{ old: "new" }`. */
  rename?: Readonly<Record<string, string>>;
  /**
   * Query parameters the new page needs, placed before the old query
   * (`/favorites` becomes `/my?tab=favorites`; an old `?id=` is kept).
   */
  search?: Readonly<Record<string, string>>;
  /** The status when it is not 301 (`302`: a page that moved on purpose). */
  status?: 302;
  /** The new path. */
  to: string;
  /**
   * `fragment`: a re-edit or renewal link (ruling 7 of phase 9). The
   * query's `token` moves into the new URL's fragment
   * (`/sponsor/edit#token=…`: a fragment in `Location` is not logged by
   * anything downstream) and the other parameters are dropped. A 301
   * would be cached indefinitely for a URL with a token, so the answer is
   * a 302. An entry whose `to` is its own `from` (the emailed
   * `/sponsor/edit?token=` links) redirects only when a token is present.
   */
  token?: "fragment";
}

const SUCCESS_PARAMS = { paymentId: "payment" } as const;

/** Most specific first: the first match wins. */
export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  { from: "/sponsors/re-edit", to: "/sponsor/edit", token: "fragment" },
  { from: "/sponsors/renew", to: "/sponsor/renew", token: "fragment" },
  // The current paths, for the links emailed before the token moved into the
  // fragment: only with a `?token=` (see `legacyRedirectResolve`).
  { from: "/sponsor/edit", to: "/sponsor/edit", token: "fragment" },
  { from: "/sponsor/renew", to: "/sponsor/renew", token: "fragment" },
  { from: "/sponsors/success", rename: SUCCESS_PARAMS, to: "/sponsor/success" },
  { from: "/sponsors", prefix: true, to: "/sponsor" },
  { from: "/success", rename: SUCCESS_PARAMS, to: "/sponsor/success" },
  { from: "/favorites", search: { tab: "favorites" }, status: 302, to: "/my" },
  { from: "/lists", search: { tab: "lists" }, status: 302, to: "/my" },
  { from: "/login", to: "/sign-in" },
  { from: "/callback", query: "drop", to: "/" },
];

/** The token parameter of an old link, and the fragment that now holds it. */
const TOKEN_PARAM = "token";
const TOKEN_REDIRECT_STATUS = 302;
const MOVED_PERMANENTLY = 301;
const FOUND = 302;

const TRAILING_SLASHES = /\/+$/;
/** The wizard, old and new path (R-11). */
const SPONSOR_PATHS = new Set(["/sponsors", "/sponsor"]);
const WIZARD_PATH = "/sponsor";
/** The old preselect parameter and the wizard's (ruling 13). */
const OLD_GESTURE_PARAM = "gestureId";
const GESTURE_PARAM = "gesture";
/** The rest of a prefixed path: plain segments only (never `//` or `\`). */
const SAFE_REST = /^(?:\/[\w.~-]+)+$/;
const GESTURES_PATH = "/gestures";

function withoutTrailingSlash(pathname: string): string {
  return pathname === "/" ? pathname : pathname.replace(TRAILING_SLASHES, "");
}

function search(params: URLSearchParams): string {
  const value = params.toString();
  return value ? `?${value}` : "";
}

function renamed(
  raw: string,
  rename: Readonly<Record<string, string>> | undefined
): string {
  const params = new URLSearchParams(raw);
  const names = Object.keys(rename ?? {}).filter((name) => params.has(name));
  if (!rename || names.length === 0) {
    return raw;
  }
  const next = new URLSearchParams();
  for (const [name, value] of params) {
    next.append(rename[name] ?? name, value);
  }
  return search(next);
}

/** `query` with `extra` first (a parameter the old query also has keeps the old value). */
function withSearch(
  query: string,
  extra: Readonly<Record<string, string>> | undefined
): string {
  if (!extra) {
    return query;
  }
  const params = new URLSearchParams(extra);
  for (const [name, value] of new URLSearchParams(query)) {
    params.set(name, value);
  }
  return search(params);
}

function tablePath(
  pathname: string
): { entry: LegacyRedirect; path: string } | null {
  for (const entry of LEGACY_REDIRECTS) {
    if (pathname === entry.from) {
      return { entry, path: entry.to };
    }
    if (entry.prefix && pathname.startsWith(`${entry.from}/`)) {
      const rest = pathname.slice(entry.from.length);
      // An odd rest (encoded slashes, backslashes) is not an old URL.
      return SAFE_REST.test(rest)
        ? { entry, path: `${entry.to}${rest}` }
        : null;
    }
  }
  return null;
}

/**
 * Category slugs by `slugify(name)`, from the published categories, so an
 * old name finds a slug the migration de-duplicated (`gevoelens-2`).
 */
export type CategorySlugs = ReadonlyMap<string, string>;

function categoryParts(url: URL): string[] | null {
  const raw = url.searchParams.get("category");
  if (raw === null) {
    return null;
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** `/gestures` with an old `?category=<Name>`: the redirect needs the categories. */
export function needsCategoryLookup(url: URL): boolean {
  if (withoutTrailingSlash(url.pathname) !== GESTURES_PATH) {
    return false;
  }
  const parts = categoryParts(url);
  return parts?.some((part) => slugify(part) !== part) ?? false;
}

/**
 * `/gestures?category=<Name>[,<Name>]` (the old filter, by name) becomes the
 * slugs (inventory R-02): the category whose name slugifies the same, else
 * `slugify(name)` (DECISIONS). A category renamed since the old link cannot
 * be found: the link then filters by a slug that matches nothing. Current
 * slug URLs are left alone, so this runs once per old link.
 */
function categoryTarget(url: URL, known: CategorySlugs): string | null {
  const parts = categoryParts(url);
  if (parts === null || parts.every((part) => slugify(part) === part)) {
    return null;
  }
  const slugs = [
    ...new Set(
      parts
        .map((part) => {
          const slug = slugify(part);
          return slug === part ? part : (known.get(slug) ?? slug);
        })
        .filter(Boolean)
    ),
  ];
  const params = new URLSearchParams(url.search);
  if (slugs.length > 0) {
    params.set("category", slugs.join(","));
  } else {
    params.delete("category");
  }
  return `${GESTURES_PATH}${search(params)}`;
}

const NO_CATEGORIES: CategorySlugs = new Map();

/**
 * The value of an old `?gestureId=` on the wizard (`/sponsors` or
 * `/sponsor`, R-11), else `null`. It may be a gesture id, a legacy
 * (Convex) id or a slug; the Worker resolves it in D1.
 */
export function gestureIdParam(url: URL): string | null {
  const pathname = withoutTrailingSlash(url.pathname).toLowerCase();
  if (!SPONSOR_PATHS.has(pathname)) {
    return null;
  }
  return url.searchParams.get(OLD_GESTURE_PARAM);
}

/**
 * `/sponsor(s)?gestureId=<x>` becomes one 301 to `/sponsor?gesture=<slug>`
 * (ruling 13), the other params kept in place. `slug` is the published
 * gesture `x` named; `null` (unknown, unpublished) drops the param, so the
 * wizard opens empty.
 */
function sponsorTarget(url: URL, slug: string | null): string {
  const next = new URLSearchParams();
  let placed = false;
  for (const [name, value] of new URLSearchParams(url.search)) {
    if (name !== OLD_GESTURE_PARAM) {
      next.append(name, value);
    } else if (slug && !placed) {
      next.append(GESTURE_PARAM, slug);
      placed = true;
    }
  }
  return `${WIZARD_PATH}${search(next)}`;
}

/** `<path>#token=<token>`, or the bare path when the link has no token. */
function tokenTarget(path: string, url: URL): string {
  const token = url.searchParams.get(TOKEN_PARAM);
  return token ? `${path}#${TOKEN_PARAM}=${encodeURIComponent(token)}` : path;
}

interface LegacyTarget {
  /** A same-site path with its query (and, for a token link, fragment). */
  location: string;
  status: 301 | 302;
}

/**
 * Where an old URL now lives and with which status, or `null` when the URL
 * is current. The table's paths match case-insensitively, as the old
 * router did (`/Login`).
 */
function legacyRedirectResolve(
  url: URL,
  categories: CategorySlugs = NO_CATEGORIES,
  gestureSlug: string | null = null
): LegacyTarget | null {
  const pathname = withoutTrailingSlash(url.pathname);
  if (pathname === GESTURES_PATH) {
    const location = categoryTarget(url, categories);
    return location === null ? null : { location, status: MOVED_PERMANENTLY };
  }
  if (gestureIdParam(url) !== null) {
    return {
      location: sponsorTarget(url, gestureSlug),
      status: MOVED_PERMANENTLY,
    };
  }
  const match = tablePath(pathname.toLowerCase());
  if (!match) {
    return null;
  }
  if (match.entry.token === "fragment") {
    // The token page itself without a token is current, not old.
    if (pathname === match.path && !url.searchParams.get(TOKEN_PARAM)) {
      return null;
    }
    return {
      location: tokenTarget(match.path, url),
      status: url.searchParams.get(TOKEN_PARAM)
        ? TOKEN_REDIRECT_STATUS
        : MOVED_PERMANENTLY,
    };
  }
  const query =
    match.entry.query === "drop" ? "" : renamed(url.search, match.entry.rename);
  return {
    location: `${match.path}${withSearch(query, match.entry.search)}`,
    status: match.entry.status === FOUND ? FOUND : MOVED_PERMANENTLY,
  };
}

/** The `Location` of {@link legacyRedirectResolve}, or `null` when current. */
export function legacyRedirectTarget(
  url: URL,
  categories: CategorySlugs = NO_CATEGORIES,
  gestureSlug: string | null = null
): string | null {
  return legacyRedirectResolve(url, categories, gestureSlug)?.location ?? null;
}

/** The published gesture's slug for an id, a legacy id or a slug, else `null`. */
export type GestureSlugLookup = (value: string) => Promise<string | null>;

const NO_GESTURES: GestureSlugLookup = () => Promise.resolve(null);

/**
 * The Worker's first step for GET and HEAD: a 301 for an old URL (a 302 for
 * an old token link, whose token moves into the fragment, also on the
 * current `/sponsor/edit` and `/sponsor/renew` paths), else
 * `null` (the request goes on to the app). `Location` is a path, so the
 * browser stays on this origin. `loadCategories` runs only for an old
 * `?category=<Name>`; when it fails, `slugify(name)` stands in.
 * `loadGestureSlug` runs only for an old `?gestureId=` on the wizard;
 * when it fails, the param is dropped (the wizard opens empty).
 */
export async function legacyRedirect(
  request: Request,
  loadCategories: () => Promise<CategorySlugs>,
  loadGestureSlug: GestureSlugLookup = NO_GESTURES
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }
  const url = new URL(request.url);
  let categories = NO_CATEGORIES;
  if (needsCategoryLookup(url)) {
    try {
      categories = await loadCategories();
    } catch (error) {
      console.error("[legacyRedirects] Failed to load the categories:", error);
    }
  }
  let gestureSlug: string | null = null;
  const gestureId = gestureIdParam(url);
  if (gestureId) {
    try {
      gestureSlug = await loadGestureSlug(gestureId);
    } catch (error) {
      console.error("[legacyRedirects] Failed to look up the gesture:", error);
    }
  }
  const target = legacyRedirectResolve(url, categories, gestureSlug);
  if (target === null) {
    return null;
  }
  // A token-carrying redirect is never cached (nor is any 302 by default:
  // say so).
  const headers: Record<string, string> = { location: target.location };
  if (target.status === TOKEN_REDIRECT_STATUS) {
    headers["cache-control"] = "no-store";
  }
  return new Response(null, { headers, status: target.status });
}
