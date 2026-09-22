import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, ApiError, payloadFetch } from "@/lib/api";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { getToken } from "@/lib/session";

/**
 * The owner's lists: read as ordinary Payload REST, written through the six
 * flat form endpoints `apps/site/src/endpoints/lists.ts` ships for its own,
 * JavaScript-free owner pages.
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
 * ## Writes: form bodies and a redirect, not JSON
 *
 * This is the one place in this task where the brief's own snippets were
 * wrong, and the task brief said to expect exactly that. `endpoints/
 * lists.ts` reads every one of its six handlers' bodies with `readForm`
 * (`req.formData()`) and `field()` — `application/x-www-form-urlencoded`,
 * never JSON — and answers with `seeOther(...)`: a 303 whose `Location`
 * carries the outcome as a page path plus a `notice=` or `error=` query
 * parameter, because these endpoints exist for the site's script-free owner
 * pages, which the browser navigates to on every submit. There is no JSON
 * body on any of the six answers.
 *
 * `postListForm` below is what a client that is not a browser navigating a
 * `<form>` has to do instead: send the same `x-www-form-urlencoded` body,
 * follow none of the redirect (`redirect: "manual"`, so the fetch resolves
 * with the 303 itself rather than whatever page it points at — that page is
 * an authenticated Next.js route reading a cookie session this app does not
 * have, and following it would answer with a sign-in page's HTML, not this
 * request's outcome), and read the created or affected list's id and the
 * `notice`/`error` code back out of the `Location` header's own path and
 * query string.
 *
 * `guardOrigin` (`apps/site/src/lib/formPost.ts`) treats an absent `Origin`
 * header as trusted — the case a same-origin browser POST can never
 * produce, but the case this app's own `fetch` calls are, since a native
 * process is not a page navigating within an origin. Nothing here needs to
 * — and nothing here does — send one.
 */

interface RawGesture {
  id: number | string;
  name?: string | null;
  playbackId?: string | null;
}

/** One gesture on a list, as `GET /api/lists/:id?depth=1` populates it. */
export interface ListGesture {
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
export interface ListItem {
  gesture: ListGesture | null;
  gestureId: string;
}

export type ListVisibility = "private" | "shared";

/** One list, as the owner's index shows it — no items, just a count. */
export interface ListSummary {
  description: string | null;
  id: string;
  itemCount: number;
  name: string;
  visibility: ListVisibility;
}

/** One list with its gestures, as the detail screen shows it. */
export interface ListDetail {
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
 * rather than only report the refusal after it, per the task brief.
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

/** What one of the six form writes below answers, parsed off its redirect. */
interface ListFormResult {
  error: null | string;
  id: null | string;
}

/** The list id in `/{locale}/account/lists/:id`, if the path has one. */
function idFromPath(pathname: string): null | string {
  const match = pathname.match(/\/lists\/(\d+)(?:\/|$)/);

  return match ? (match[1] ?? null) : null;
}

/**
 * Posts one of the six owner writes as the form body
 * `endpoints/lists.ts` expects, and reads the outcome back out of the 303's
 * `Location` rather than a JSON body — see the module comment above for why
 * there is no JSON body to read instead.
 *
 * A response with no `Location` at all (a network failure `fetch` did not
 * throw for, or a host answering with something that is not this endpoint)
 * is treated as `"unknown"` rather than being trusted as a success — success
 * is never the default a caller falls into here.
 */
async function postListForm(
  path: string,
  fields: Record<string, string>
): Promise<ListFormResult> {
  const token = await getToken();
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
  });

  if (token !== null) {
    headers.set("Authorization", `JWT ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      body: new URLSearchParams({
        locale: DEFAULT_LOCALE,
        ...fields,
      }).toString(),
      headers,
      method: "POST",
      redirect: "manual",
    });
  } catch {
    throw new ApiError("network", 0);
  }

  const location = response.headers.get("Location");

  if (location === null) {
    return { error: "unknown", id: null };
  }

  const target = new URL(location, API_BASE_URL);

  if (target.pathname.includes("/sign-in")) {
    return { error: "signed-out", id: null };
  }

  return {
    error: target.searchParams.get("error"),
    id: idFromPath(target.pathname),
  };
}

/** Throws with the code the endpoint's redirect carried, or does nothing. */
function throwOnError(result: ListFormResult): void {
  if (result.error !== null) {
    throw new ApiError(result.error, 0);
  }
}

/** `POST /account/lists/create`. Resolves to the new list's id. */
export async function createList(input: {
  description?: string;
  name: string;
}): Promise<{ id: string }> {
  const result = await postListForm("/account/lists/create", {
    description: input.description ?? "",
    name: input.name,
  });

  throwOnError(result);

  if (result.id === null) {
    throw new ApiError("unknown", 0);
  }

  return { id: result.id };
}

/** `POST /account/lists/rename`. */
export async function renameList(input: {
  description?: string;
  id: string;
  name: string;
}): Promise<void> {
  const result = await postListForm("/account/lists/rename", {
    description: input.description ?? "",
    id: input.id,
    name: input.name,
  });

  throwOnError(result);
}

/**
 * `POST /account/lists/delete`. `confirmName` must match the list's current
 * name — case- and space-insensitively, the same as the endpoint checks it
 * — or the request is refused with `error: "confirm"` before anything is
 * deleted.
 */
export async function deleteList(input: {
  confirmName: string;
  id: string;
}): Promise<void> {
  const result = await postListForm("/account/lists/delete", {
    confirmName: input.confirmName,
    id: input.id,
  });

  throwOnError(result);
}

/** `POST /account/lists/add`. */
export async function addToList(input: {
  gestureId: string;
  id: string;
}): Promise<void> {
  const result = await postListForm("/account/lists/add", {
    gestureId: input.gestureId,
    id: input.id,
  });

  throwOnError(result);
}

/** `POST /account/lists/remove`. */
export async function removeFromList(input: {
  gestureId: string;
  id: string;
}): Promise<void> {
  const result = await postListForm("/account/lists/remove", {
    gestureId: input.gestureId,
    id: input.id,
  });

  throwOnError(result);
}

/** `POST /account/lists/share` — the endpoint's own name for this write is `setVisibility`. */
export async function shareList(input: {
  id: string;
  visibility: ListVisibility;
}): Promise<void> {
  const result = await postListForm("/account/lists/share", {
    id: input.id,
    visibility: input.visibility,
  });

  throwOnError(result);
}
