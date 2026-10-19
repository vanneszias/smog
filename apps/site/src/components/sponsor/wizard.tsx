import {
  gestureOptions,
  gestureSearchOptions,
  gesturesBrowseOptions,
  SEARCH_DEBOUNCE_MS,
  useCategories,
  useDebouncedValue,
} from "@smog/gestures/client";
import type { GesturesContract } from "@smog/gestures/contract";
import type { GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { useRpcQuery } from "@smog/rpc/react";
import {
  availabilityOptions,
  type PreselectGesture,
  useAvailability,
  useCheckout,
  useSponsorshipsRpc,
  useWizard,
  type WizardDetails,
  type WizardGesture,
  type WizardStep,
  wizardPrice,
} from "@smog/sponsorships/client";
import {
  AVAILABILITY_IDS_MAX,
  type AvailabilityItem,
} from "@smog/sponsorships/schema";
import { EmptyState, Stepper } from "@smog/ui-web";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  invalidStateReason,
  mutationErrorMessage,
  unavailableGestureIds,
} from "./errors";
import { usePageLocale } from "./page-locale";
import { SelectionBar } from "./selection-bar";
import { StepDetails } from "./step-details";
import { StepReview } from "./step-review";
import { type SelectSearch, StepSelect } from "./step-select";
import { useTurnstileToken } from "./use-turnstile-token";

/** A search answers one page of at most 50 (`gestures.search`). */
const SEARCH_LIMIT = 50;

/** Attempts that cannot be answered again need a new `checkoutId` (ruling 5). */
const NEW_ATTEMPT_REASONS = new Set(["alreadySettled", "paymentProvider"]);

function sendToMollie(checkoutUrl: string): void {
  window.location.assign(checkoutUrl);
}

/**
 * `?gesture=` (one or more slugs): resolved through `gestures.bySlug`,
 * then checked with `sponsorships.availability`, then preselected once
 * when the selection is still empty (S-03, ruling 13).
 */
function usePreselect(
  slugs: readonly string[],
  apply: (gestures: PreselectGesture[]) => void
): void {
  const { gestures } = useRpcQuery<{ gestures: GesturesContract }>();
  const found = useQueries({
    queries: slugs.map((slug) => ({
      ...gestureOptions(gestures, slug),
      retry: false,
    })),
  });
  const settled = found.every((query) => !query.isPending);
  const details = found.flatMap((query) => (query.data ? [query.data] : []));
  const availability = useAvailability(details.map((detail) => detail.id));
  const done = useRef(slugs.length === 0);
  useEffect(() => {
    if (done.current || !settled) {
      return;
    }
    if (details.length === 0) {
      done.current = true;
      return;
    }
    if (!availability.data) {
      if (availability.isError) {
        done.current = true;
      }
      return;
    }
    done.current = true;
    const states = new Map(
      availability.data.items.map((item) => [item.gestureId, item.state])
    );
    apply(
      details.map((detail) => ({
        id: detail.id,
        name: detail.name,
        playbackId: detail.playbackId,
        slug: detail.slug,
        state: states.get(detail.id) ?? "unavailable",
      }))
    );
  }, [apply, availability.data, availability.isError, details, settled]);
}

/**
 * The grid's gestures (review I-1): with no query, the whole catalogue a
 * keyset page at a time (`gestures.list`, "Load more"), so every gesture
 * can be reached; with a query, the ranked search (one page of 50, and
 * `partialOf` when it matched more).
 */
function useGrid(search: SelectSearch) {
  const { gestures } = useRpcQuery<{ gestures: GesturesContract }>();
  const q = useDebouncedValue(search.q.trim(), SEARCH_DEBOUNCE_MS);
  const searching = search.q.trim() !== "";
  const browse = useInfiniteQuery({
    ...gesturesBrowseOptions(gestures, { category: search.categories }),
    enabled: !searching,
  });
  // Not the catalogue search `search_performed` measures: no event.
  const found = useQuery({
    ...gestureSearchOptions(gestures, {
      category: search.categories,
      limit: SEARCH_LIMIT,
      q,
    }),
    enabled: searching && q !== "",
    placeholderData: keepPreviousData,
  });
  const browsed = useMemo(
    () => browse.data?.pages.flatMap((page) => page.items),
    [browse.data]
  );
  if (searching) {
    const total = found.data?.total ?? 0;
    const items: readonly GestureSummary[] | undefined = found.data?.items;
    return {
      data: items,
      hasMore: false,
      isError: found.isError,
      isRefetching: found.isRefetching,
      loadingMore: false,
      onLoadMore: () => undefined,
      partialOf: items && total > items.length ? total : null,
      refetch: () => {
        found.refetch().catch(() => undefined);
      },
    };
  }
  return {
    data: browsed,
    hasMore: browse.hasNextPage,
    isError: browse.isError,
    isRefetching: browse.isRefetching,
    loadingMore: browse.isFetchingNextPage,
    onLoadMore: () => {
      browse.fetchNextPage().catch(() => undefined);
    },
    partialOf: null,
    refetch: () => {
      browse.refetch().catch(() => undefined);
    },
  };
}

/**
 * `sponsorships.availability` for every id shown, in reads of at most
 * 100 (one `json_each` parameter each); `checkoutEnabled` from the first.
 *
 * - "Load more" and every search keystroke change the chunks' ids, so
 *   each read is a new query with no data. An id keeps its last answered
 *   state until its new read answers (phase review M-6), so cards already
 *   shown never flash disabled; the server checks again at checkout.
 * - A failed read is reported with a `retry` over the failed chunks
 *   (phase review I-2): the step says so instead of a dead grid.
 */
function useGridAvailability(ids: readonly string[]) {
  const sponsorships = useSponsorshipsRpc();
  const chunks = useMemo(() => {
    const out: string[][] = [];
    for (let at = 0; at < ids.length; at += AVAILABILITY_IDS_MAX) {
      out.push(ids.slice(at, at + AVAILABILITY_IDS_MAX));
    }
    return out;
  }, [ids]);
  const reads = useQueries({
    queries: chunks.map((chunk) => availabilityOptions(sponsorships, chunk)),
  });
  // The last answer per id, kept across reads (written after render).
  const known = useRef<{
    byId: Map<string, AvailabilityItem>;
    checkoutEnabled: boolean | undefined;
  }>({ byId: new Map(), checkoutEnabled: undefined });
  const byId = new Map<string, AvailabilityItem>();
  for (const id of ids) {
    const item = known.current.byId.get(id);
    if (item) {
      byId.set(id, item);
    }
  }
  for (const read of reads) {
    for (const item of read.data?.items ?? []) {
      byId.set(item.gestureId, item);
    }
  }
  const checkoutEnabled =
    reads[0]?.data?.checkoutEnabled ?? known.current.checkoutEnabled;
  useEffect(() => {
    for (const [id, item] of byId) {
      known.current.byId.set(id, item);
    }
    known.current.checkoutEnabled = checkoutEnabled;
  });
  const failed = reads.filter((read) => read.isError);
  const retry = useCallback(() => {
    for (const read of failed) {
      read.refetch().catch(() => undefined);
    }
  }, [failed]);
  return {
    byId,
    checkoutEnabled,
    error:
      failed.length > 0
        ? { retry, retrying: failed.some((read) => read.isFetching) }
        : null,
  };
}

/** Moves focus to the new step's title (and the page to the top). */
function useStepFocus(step: WizardStep) {
  const title = useRef<HTMLHeadingElement | null>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) {
      return;
    }
    shown.current = step;
    window.scrollTo({ top: 0 });
    title.current?.focus();
  }, [step]);
  return useCallback((node: HTMLHeadingElement | null) => {
    title.current = node;
  }, []);
}

export interface SponsorWizardProps {
  /** Slugs from `?gesture=`. */
  preselect: readonly string[];
  /** Where "Continue to payment" sends the browser (Mollie). */
  redirect?: (checkoutUrl: string) => void;
  /** The Turnstile site key, or `null` (dev: no widget). */
  turnstileSiteKey: string | null;
}

/**
 * The sponsor wizard (S-01–S-11, spec §16 flow 4): Choose gestures → Your
 * details → Preview & pay, in memory only. When sponsoring is paused (no
 * Mollie key, `checkoutEnabled: false`), a calm notice replaces it.
 */
export function SponsorWizard({
  preselect,
  redirect = sendToMollie,
  turnstileSiteKey,
}: SponsorWizardProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const queryClient = useQueryClient();
  const sponsorships = useSponsorshipsRpc();
  const [state, dispatch] = useWizard();
  const [search, setSearch] = useState<SelectSearch>({ categories: [], q: "" });
  const [paused, setPaused] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const turnstile = useTurnstileToken();
  const { reset: resetTurnstile, token } = turnstile;
  const titleRef = useStepFocus(state.step);

  const results = useGrid(search);
  const categories = useCategories();
  const ids = useMemo(
    () => [
      ...new Set([
        ...(results.data?.map((gesture) => gesture.id) ?? []),
        ...state.selected.map((gesture) => gesture.id),
      ]),
    ],
    [results.data, state.selected]
  );
  const availability = useGridAvailability(ids);

  const applyPreselect = useCallback(
    (gestures: PreselectGesture[]) => dispatch({ gestures, type: "preselect" }),
    [dispatch]
  );
  usePreselect(preselect, applyPreselect);

  const checkout = useCheckout({ onRedirect: redirect });

  const toggle = useCallback(
    (gesture: WizardGesture) => dispatch({ gesture, type: "toggle" }),
    [dispatch]
  );
  const goTo = useCallback(
    (step: WizardStep) => () => {
      setPayError(null);
      // The widget lives on step 3: its token goes with it (review M-3).
      resetTurnstile();
      dispatch({ step, type: "step" });
    },
    [dispatch, resetTurnstile]
  );
  const setDetails = useCallback(
    (patch: Partial<WizardDetails>) => dispatch({ patch, type: "details" }),
    [dispatch]
  );
  const setLogo = useCallback(
    (logo: Blob | null) => dispatch({ logo, type: "logo" }),
    [dispatch]
  );

  const busy = checkout.isPending || checkout.redirecting;
  const pay = useCallback(() => {
    // One attempt at a time, and none while the browser leaves (review I-9).
    if (busy) {
      return;
    }
    setPayError(null);
    // The next edit is a different payment: it takes a new id (review I-2).
    dispatch({ nextCheckoutId: crypto.randomUUID(), type: "attempt" });
    checkout.mutate(
      { locale, state, turnstileToken: token },
      {
        onError: (error) => {
          // A Turnstile token is single use: fetch another.
          resetTurnstile();
          const taken = unavailableGestureIds(error);
          if (taken) {
            dispatch({ gestureIds: taken, type: "unavailable" });
            queryClient
              .invalidateQueries({ queryKey: sponsorships.availability.key() })
              .catch(() => undefined);
            return;
          }
          const reason = invalidStateReason(error);
          if (reason === "paymentsUnavailable") {
            setPaused(true);
            return;
          }
          if (reason && NEW_ATTEMPT_REASONS.has(reason)) {
            dispatch({ checkoutId: crypto.randomUUID(), type: "newAttempt" });
          }
          setPayError(mutationErrorMessage(error, t, "sponsor.review.failed"));
        },
      }
    );
  }, [
    busy,
    checkout,
    dispatch,
    locale,
    queryClient,
    resetTurnstile,
    sponsorships,
    state,
    t,
    token,
  ]);

  if (paused || availability.checkoutEnabled === false) {
    return (
      <EmptyState
        description={t("sponsor.paused.description")}
        illustration={2}
        level={1}
        title={t("sponsor.paused.title")}
      />
    );
  }

  const steps = [
    { label: t("sponsor.steps.select") },
    { label: t("sponsor.steps.details") },
    { label: t("sponsor.steps.review") },
  ];
  let body: ReactNode;
  if (state.step === 0) {
    body = (
      <>
        <StepSelect
          availability={availability.byId}
          availabilityError={availability.error}
          categories={categories.data ?? []}
          onSearch={setSearch}
          onToggle={toggle}
          results={results}
          search={search}
          state={state}
          titleRef={titleRef}
        />
        <SelectionBar
          count={state.selected.length}
          onContinue={goTo(1)}
          totalCents={wizardPrice(state)?.totalCents ?? 0}
        />
      </>
    );
  } else if (state.step === 1) {
    body = (
      <StepDetails
        onBack={goTo(0)}
        onContinue={goTo(2)}
        onDetails={setDetails}
        onLogo={setLogo}
        state={state}
        titleRef={titleRef}
      />
    );
  } else {
    body = (
      <StepReview
        error={payError}
        onBack={goTo(1)}
        onPay={pay}
        onToken={turnstile.setToken}
        paying={busy}
        state={state}
        titleRef={titleRef}
        turnstileKey={turnstile.key}
        turnstileSiteKey={turnstileSiteKey}
        verified={turnstileSiteKey === null || token !== null}
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <Stepper current={state.step} steps={steps} />
      {body}
    </div>
  );
}
