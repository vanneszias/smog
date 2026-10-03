import {
  gestureOptions,
  useCategories,
  useGestureSearch,
} from "@smog/gestures/client";
import type { GesturesContract } from "@smog/gestures/contract";
import { useTranslation } from "@smog/i18n/react";
import { useRpcQuery } from "@smog/rpc/react";
import {
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
import type { AvailabilityItem } from "@smog/sponsorships/schema";
import { EmptyState, Stepper } from "@smog/ui-web";
import { useQueries, useQueryClient } from "@tanstack/react-query";
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

/** One page of the grid: `gestures.search` answers at most 50. */
const GRID_LIMIT = 50;

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
  const [token, setToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const titleRef = useStepFocus(state.step);

  const results = useGestureSearch({
    category: search.categories,
    limit: GRID_LIMIT,
    q: search.q,
    track: false,
  });
  const categories = useCategories();
  const ids = useMemo(
    () => [
      ...new Set([
        ...(results.data?.items.map((gesture) => gesture.id) ?? []),
        ...state.selected.map((gesture) => gesture.id),
      ]),
    ],
    [results.data, state.selected]
  );
  const availability = useAvailability(ids);
  const availabilityById = useMemo(
    () =>
      new Map<string, AvailabilityItem>(
        availability.data?.items.map((item) => [item.gestureId, item]) ?? []
      ),
    [availability.data]
  );

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
      dispatch({ step, type: "step" });
    },
    [dispatch]
  );
  const setDetails = useCallback(
    (patch: Partial<WizardDetails>) => dispatch({ patch, type: "details" }),
    [dispatch]
  );
  const setLogo = useCallback(
    (logo: Blob | null) => dispatch({ logo, type: "logo" }),
    [dispatch]
  );

  const pay = useCallback(() => {
    setPayError(null);
    checkout.mutate(
      { locale, state, turnstileToken: token },
      {
        onError: (error) => {
          // A Turnstile token is single use: fetch another.
          setTurnstileKey((key) => key + 1);
          setToken(null);
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
  }, [checkout, dispatch, locale, queryClient, sponsorships, state, t, token]);

  if (paused || availability.data?.checkoutEnabled === false) {
    return (
      <EmptyState
        description={t("sponsor.paused.description")}
        illustration={2}
        level={2}
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
          availability={availabilityById}
          categories={categories.data ?? []}
          onSearch={setSearch}
          onToggle={toggle}
          results={{
            data: results.data?.items,
            isError: results.isError,
            isRefetching: results.isRefetching,
            refetch: () => {
              results.refetch().catch(() => undefined);
            },
          }}
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
        onToken={setToken}
        paying={checkout.isPending}
        state={state}
        titleRef={titleRef}
        turnstileKey={turnstileKey}
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
