import type { CategoryOption, GestureSummary } from "@smog/ui-native";
import { getLocales } from "expo-localization";
import { useCallback, useEffect, useState } from "react";
import { ApiError, payloadFetch } from "@/lib/api";
import { resolveLocale } from "@/lib/locale";

/**
 * Everything this app reads about gestures and categories, and the three
 * hooks every catalogue screen reads them through.
 *
 * ## Which reads are endpoints, and which are plain REST
 *
 * `useGestures` calls `GET /api/mobile/gestures` — `apps/site/src/endpoints/
 * mobile.ts` — because the web already owns two rules a client cannot
 * re-derive from a query string: the list's stable, clamped sort
 * (`gestureQuery.ts`) and search's two-pass locale fallback (`search.ts`).
 *
 * `useGesture` and `useCategories` are ordinary `GET /api/<collection>`
 * reads instead. A gesture by id needs no rule this app would otherwise
 * duplicate — `publicReadActive` already 404s an inactive one for an
 * anonymous reader, exactly as `lib/gestureDetail.ts`'s own `fetchGesture`
 * gets it via the local API. The category list has the same access rule and
 * no pagination for an unstable sort to break — `fetchCategoryOptions`'s
 * `sort: ["name", "id"]` is expressible as a query-string parameter, so this
 * hook sends it rather than carrying a third endpoint that would just
 * restate it.
 */

/** One page of `GET /api/mobile/gestures`. */
interface GesturesPage {
  docs: GestureSummary[];
  page: number;
  totalDocs: number;
  totalPages: number;
}

/** What `payload.findByID` hands back for `gestures/:id` at `depth: 1`. */
interface RawCategory {
  id: number | string;
  name?: string | null;
}
interface RawGesture {
  id: number | string;
  name?: string | null;
  playbackId?: string | null;
  categories?: (RawCategory | number | string)[] | null;
}

/**
 * A raw Payload gesture as `GestureCard`/`VideoPlayer` want it.
 *
 * The same three conversions `apps/site/src/lib/gestureQuery.ts`'s
 * `toGestureSummary` makes, redone here rather than imported: this is a
 * React Native app and that module lives in `apps/site`, on the other side
 * of an HTTP request. Nothing here is a *rule* — no access decision, no
 * sort, no fallback — it is reshaping one response body, which is why it is
 * not the kind of duplication the two endpoints above exist to avoid.
 */
function toSummary(raw: RawGesture): GestureSummary {
  const categories = (raw.categories ?? [])
    .filter((category): category is RawCategory => typeof category === "object")
    .map((category) => ({
      id: String(category.id),
      name: category.name ?? "",
    }));

  return {
    categories,
    id: String(raw.id),
    name: raw.name ?? "",
    playbackId: raw.playbackId,
  };
}

function currentLocale() {
  return resolveLocale(getLocales().map((locale) => locale.languageTag));
}

function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("network", 0);
}

interface HookResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

interface UseGesturesParams {
  q?: string;
  category?: string | null;
  page?: number;
  /** `false` skips the request entirely — the search tab's empty-query state. */
  enabled?: boolean;
}

/** `GET /api/mobile/gestures?locale=&page=&category=&q=`. */
export function useGestures(
  params: UseGesturesParams
): HookResult<GesturesPage> {
  const { q = "", category = null, page = 1, enabled = true } = params;
  const [data, setData] = useState<GesturesPage | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` is never read in this effect — it exists only so `refetch` below can change it and force this effect to re-run; removing it, as the rule's own fix would, silently breaks every retry button in this app.
  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);

      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const search = new URLSearchParams();
    search.set("page", String(page));

    if (category !== null) {
      search.set("category", category);
    }

    if (q.trim() !== "") {
      search.set("q", q);
    }

    payloadFetch<GesturesPage>(`/mobile/gestures?${search.toString()}`, {
      locale: currentLocale(),
    }).then(
      (result) => {
        if (!cancelled) {
          setData(result);
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
  }, [q, category, page, enabled, generation]);

  const refetch = useCallback(() => setGeneration((value) => value + 1), []);

  return { data, error, loading, refetch };
}

/** `GET /api/gestures/:id?depth=1` — an ordinary read; see the module note. */
export function useGesture(id: string): HookResult<GestureSummary> {
  const [data, setData] = useState<GestureSummary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: see useGestures's identical note above.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    payloadFetch<RawGesture>(`/gestures/${id}?depth=1`, {
      locale: currentLocale(),
    }).then(
      (raw) => {
        if (!cancelled) {
          setData(toSummary(raw));
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

/** `GET /api/categories?...` — an ordinary read; see the module note. */
export function useCategories(): HookResult<CategoryOption[]> {
  const [data, setData] = useState<CategoryOption[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: see useGestures's identical note above.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    payloadFetch<{ docs: RawCategory[] }>(
      "/categories?depth=0&limit=0&sort=name,id",
      {
        locale: currentLocale(),
      }
    ).then(
      (result) => {
        if (!cancelled) {
          setData(
            result.docs.map((category) => ({
              id: String(category.id),
              name: category.name ?? "",
            }))
          );
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
