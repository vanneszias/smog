import { slugify } from "@smog/utils";

/**
 * The old site's URLs that moved (spec §9, inventory §7). Each one answers
 * 301 with its query string. Destinations are fixed paths on this site, so
 * no input can turn a redirect into an open one.
 *
 * `/favorites` is a real page again and `/lists/<token>` keeps its tokens,
 * so neither is here. An old `/gestures/<convexId>` is resolved by the
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
  /** The new path. */
  to: string;
}

const SUCCESS_PARAMS = { paymentId: "payment" } as const;

/** Most specific first: the first match wins. */
export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  { from: "/sponsors/re-edit", to: "/sponsor/edit" },
  { from: "/sponsors/success", rename: SUCCESS_PARAMS, to: "/sponsor/success" },
  { from: "/sponsors", prefix: true, to: "/sponsor" },
  { from: "/success", rename: SUCCESS_PARAMS, to: "/sponsor/success" },
  { from: "/login", to: "/sign-in" },
  { from: "/callback", query: "drop", to: "/" },
];

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

/**
 * Where an old URL now lives (a same-site path with its query), or `null`
 * when the URL is current. The table's paths match case-insensitively, as
 * the old router did (`/Login`).
 */
export function legacyRedirectTarget(
  url: URL,
  categories: CategorySlugs = NO_CATEGORIES,
  gestureSlug: string | null = null
): string | null {
  const pathname = withoutTrailingSlash(url.pathname);
  if (pathname === GESTURES_PATH) {
    return categoryTarget(url, categories);
  }
  if (gestureIdParam(url) !== null) {
    return sponsorTarget(url, gestureSlug);
  }
  const match = tablePath(pathname.toLowerCase());
  if (!match) {
    return null;
  }
  const query =
    match.entry.query === "drop" ? "" : renamed(url.search, match.entry.rename);
  return `${match.path}${query}`;
}

/** The published gesture's slug for an id, a legacy id or a slug, else `null`. */
export type GestureSlugLookup = (value: string) => Promise<string | null>;

const NO_GESTURES: GestureSlugLookup = () => Promise.resolve(null);

/**
 * The Worker's first step for GET and HEAD: a 301 for an old URL, else
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
  const location = legacyRedirectTarget(url, categories, gestureSlug);
  if (location === null) {
    return null;
  }
  return new Response(null, { headers: { location }, status: 301 });
}
