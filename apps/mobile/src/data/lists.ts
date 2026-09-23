import { getLocales } from "expo-localization";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, ApiError, payloadFetch } from "@/lib/api";
import { type Locale, resolveLocale } from "@/lib/locale";
import { getToken } from "@/lib/session";

/**
 * The owner's lists: read as ordinary Payload REST, written through
 * `apps/site/src/endpoints/lists.ts`'s `/api/mobile/lists/*` — the JSON
 * sibling of that file's six owner-page form endpoints.
 *
 * ## Reads: plain `GET /api/lists` and `GET /api/lists/:id`
 *
 * There is no read endpoint alongside the six writes — the site's own owner
 * pages read through `lib/ownedLists.ts`'s Local API calls, not through
 * `endpoints/lists.ts`. What makes an ordinary `GET /api/lists` safe to read
 * from here is the same thing that makes it safe for anyone: `listReadAccess`
 * (`apps/site/src/access/lists.ts`) narrows a signed-in non-admin request to
 * `{ owner: { equals: req.user.id } }` on its own, so this app does not have
 * to ask for "my lists" — every list this account is allowed to read *is*
 * this account's own.
 *
 * ## Writes: `/api/mobile/lists/*`, not the owner pages' form endpoints
 *
 * The owner pages' six writes (`/api/account/lists/*`) read
 * `application/x-www-form-urlencoded` bodies and answer with a 303 whose
 * `Location` carries the outcome as a page path plus a `notice=`/`error=`
 * code — a shape built for a `<form>` a browser navigates, and unreadable
 * from here: React Native's `fetch` is a bare re-export of `whatwg-fetch`
 * (`Libraries/Network/fetch.js`), which reads no `redirect` option at all —
 * `redirect: "manual"` does nothing, the underlying `XMLHttpRequest` has
 * already followed the redirect by the time `onload` fires, and the page it
 * followed into is a cookie-authenticated Next.js route this app has no
 * session for. That was this module's first version, and it did not work.
 *
 * `/api/mobile/lists/*` is the fix: the same six decisions
 * (`endpoints/lists.ts`'s `decide*` functions), rendered as a JSON body
 * instead of a redirect. `postListJson` below is deliberately not routed
 * through `payloadFetch` — the same call `session.ts`'s `signUp` makes and
 * documents: a refusal here is `{ status: "invalid", field: "name" }`, not
 * Payload's own `{ errors: [...] }`, and `payloadFetch`'s error handling
 * reads the latter shape, not this one.
 */

interface RawGesture {
  id: number | string;
  name?: string | null;
  playbackId?: string | null;
}

/** One gesture on a list, as `GET /api/lists/:id?depth=1` populates it. */
interface ListGesture {
  id: string;
  name: string;
  playbackId?: string | null;
}

/**
 * One row of a list's `items`.
 *
 * `gesture` is `null` for a row whose gesture an editor has since
 * deactivated: `publicReadActive` leaves it unpopulated rather than removed
 * (`lib/ownedLists.ts`'s own comment on `fetchOwnedList`), because the owner
 * still has to see the row is there and be able to take it off — unlike a
 * favourite, a list row is never silently dropped for this reason.
 * `gestureId` survives that case regardless, since it is read off the row
 * itself rather than off the populated document, and is what a "remove"
 * control needs to act on a row it cannot otherwise describe.
 */
interface ListItem {
  gesture: ListGesture | null;
  gestureId: string;
}

type ListVisibility = "private" | "shared";

/** One list, as the owner's index shows it — no items, just a count. */
interface ListSummary {
  description: string | null;
  id: string;
  itemCount: number;
  name: string;
  visibility: ListVisibility;
}

/** One list with its gestures, as the detail screen shows it. */
interface ListDetail {
  description: string | null;
  id: string;
  items: ListItem[];
  name: string;
  visibility: ListVisibility;
}

/**
 * How many gestures one list may hold.
 *
 * The same 50 `apps/site/src/lib/ownedLists.ts`'s `MAX_LIST_ITEMS` is, and
 * the server enforces its own copy regardless of what this app does with
 * this one — this exists so the app can show the limit before the request
 * rather than only report the refusal after it.
 * `lists.test.ts` pins this against the server's own value so the two
 * cannot silently drift apart, the same way `favorites.ts`'s
 * `MAX_RESOLVED_FAVORITES` is pinned against `lib/guest.ts`'s cap.
 */
export const MAX_LIST_ITEMS = 50;

interface HookResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("network", 0);
}

interface RawListItem {
  gesture: null | number | RawGesture | string;
}

interface RawList {
  description?: null | string;
  id: number | string;
  items?: null | RawListItem[];
  name: string;
  visibility: ListVisibility;
}

function itemGestureId(item: RawListItem): string {
  return typeof item.gesture === "object" && item.gesture !== null
    ? String(item.gesture.id)
    : String(item.gesture);
}

function toListItem(item: RawListItem): ListItem {
  const gesture = item.gesture;

  return {
    gesture:
      typeof gesture === "object" && gesture !== null
        ? {
            id: String(gesture.id),
            name: gesture.name ?? "",
            playbackId: gesture.playbackId,
          }
        : null,
    gestureId: itemGestureId(item),
  };
}

function toListSummary(raw: RawList): ListSummary {
  return {
    description: raw.description ?? null,
    id: String(raw.id),
    itemCount: (raw.items ?? []).length,
    name: raw.name,
    visibility: raw.visibility,
  };
}

function toListDetail(raw: RawList): ListDetail {
  return {
    description: raw.description ?? null,
    id: String(raw.id),
    items: (raw.items ?? []).map(toListItem),
    name: raw.name,
    visibility: raw.visibility,
  };
}

/**
 * This account's own lists, most recently changed first — the same sort
 * `fetchOwnedLists` uses, expressed as a query string, and `depth: 0`
 * because the index only ever counts each list's items.
 */
export function useLists(): HookResult<ListSummary[]> {
  const [data, setData] = useState<ListSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` only forces `refetch` to re-run this effect.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    payloadFetch<{ docs: RawList[] }>(
      "/lists?depth=0&limit=100&sort=-updatedAt,id",
      { auth: true }
    ).then(
      (result) => {
        if (!cancelled) {
          setData(result.docs.map(toListSummary));
          setLoading(false);
        }
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(toApiError(loadError));
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [generation]);

  const refetch = useCallback(() => setGeneration((value) => value + 1), []);

  return { data, error, loading, refetch };
}

/** One owned list, with its gestures populated at `depth: 1`. */
export function useList(id: string): HookResult<ListDetail> {
  const [data, setData] = useState<ListDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` only forces `refetch` to re-run this effect.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    payloadFetch<RawList>(`/lists/${id}?depth=1`, { auth: true }).then(
      (raw) => {
        if (!cancelled) {
          setData(toListDetail(raw));
          setLoading(false);
        }
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(toApiError(loadError));
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [id, generation]);

  const refetch = useCallback(() => setGeneration((value) => value + 1), []);

  return { data, error, loading, refetch };
}

function currentLocale(): Locale {
  return resolveLocale(getLocales().map((locale) => locale.languageTag));
}

/** What one of the six writes below answers. */
interface ListWriteResult {
  field?: string;
  id?: string;
  status: string;
}

/** The body shape a caller of `postListJson` narrows before returning it. */
function isListWriteResult(value: unknown): value is ListWriteResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "string"
  );
}

/**
 * Posts one of the six owner writes as JSON to `/api/mobile/lists/*`, and
 * reads the outcome back out of the JSON body.
 *
 * Deliberately not routed through `payloadFetch`, for the reason
 * `session.ts`'s `signUp` gives about its own endpoint: a refusal here is
 * `{ status: "invalid", field: "name" }`, and Payload's own error body is
 * `{ errors: [{ message }] }` — shapes `payloadFetch`'s error handling is
 * not built to read.
 *
 * A response whose body cannot be read as JSON, or that has no `status`
 * string in it, is treated as `network` rather than trusted as a success —
 * success is never the default a caller falls into here.
 */
async function postListJson(
  path: string,
  body: Record<string, string>
): Promise<ListWriteResult> {
  const token = await getToken();
  const headers = new Headers({ "Content-Type": "application/json" });

  if (token !== null) {
    headers.set("Authorization", `JWT ${token}`);
  }

  const url = new URL(`${API_BASE_URL}/api${path}`);
  url.searchParams.set("locale", currentLocale());

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });
  } catch {
    throw new ApiError("network", 0);
  }

  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    throw new ApiError("network", response.status);
  }

  if (!isListWriteResult(parsed)) {
    throw new ApiError("network", response.status);
  }

  return parsed;
}

/**
 * Throws with the code the endpoint's body carried, for every status that is
 * not a success, or does nothing.
 *
 * `"invalid"` throws with the specific field the endpoint refused
 * (`"name"`, `"full"`, `"confirm"`, …) so a caller can show the message that
 * matches; `"signed-out"` and `"unknown-list"` throw with their own status
 * as the code, since neither carries a field.
 */
function throwOnError(result: ListWriteResult): void {
  if (result.status === "invalid") {
    throw new ApiError(result.field ?? "invalid", 0);
  }

  if (result.status === "signed-out" || result.status === "unknown-list") {
    throw new ApiError(result.status, 0);
  }
}

/** `POST /api/mobile/lists/create`. Resolves to the new list's id. */
export async function createList(input: {
  description?: string;
  name: string;
}): Promise<{ id: string }> {
  const result = await postListJson("/mobile/lists/create", {
    description: input.description ?? "",
    name: input.name,
  });

  throwOnError(result);

  if (typeof result.id !== "string") {
    throw new ApiError("network", 0);
  }

  return { id: result.id };
}

/** `POST /api/mobile/lists/rename`. */
export async function renameList(input: {
  description?: string;
  id: string;
  name: string;
}): Promise<void> {
  const result = await postListJson("/mobile/lists/rename", {
    description: input.description ?? "",
    id: input.id,
    name: input.name,
  });

  throwOnError(result);
}

/**
 * `POST /api/mobile/lists/delete`. `confirmName` must match the list's
 * current name — case- and space-insensitively, the same as the endpoint
 * checks it — or the request is refused with `field: "confirm"` before
 * anything is deleted.
 */
export async function deleteList(input: {
  confirmName: string;
  id: string;
}): Promise<void> {
  const result = await postListJson("/mobile/lists/delete", {
    confirmName: input.confirmName,
    id: input.id,
  });

  throwOnError(result);
}

/**
 * `POST /api/mobile/lists/add`. Refuses with `field: "full"` once the list
 * already holds {@link MAX_LIST_ITEMS} gestures — the server's own bound,
 * shown before the request by whichever screen calls this.
 */
export async function addToList(input: {
  gestureId: string;
  id: string;
}): Promise<void> {
  const result = await postListJson("/mobile/lists/add", {
    gestureId: input.gestureId,
    id: input.id,
  });

  throwOnError(result);
}

/** `POST /api/mobile/lists/remove`. */
export async function removeFromList(input: {
  gestureId: string;
  id: string;
}): Promise<void> {
  const result = await postListJson("/mobile/lists/remove", {
    gestureId: input.gestureId,
    id: input.id,
  });

  throwOnError(result);
}

/**
 * `POST /api/mobile/lists/share` — the endpoint's own name for this write is
 * `decideSetVisibility`.
 */
export async function shareList(input: {
  id: string;
  visibility: ListVisibility;
}): Promise<void> {
  const result = await postListJson("/mobile/lists/share", {
    id: input.id,
    visibility: input.visibility,
  });

  throwOnError(result);
}
