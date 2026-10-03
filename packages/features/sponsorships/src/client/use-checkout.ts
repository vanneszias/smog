/**
 * The sponsor wizard (S-01–S-11): its state, kept in memory only (S-01: a
 * reload starts again), as a tested reducer; the details check; the
 * checkout input; and `useCheckout`, which runs "Continue to payment":
 * `uploadLogo` → PUT → `checkout` → `sponsorship_checkout_started` → the
 * redirect to Mollie (ruling 13).
 */
import { useAnalytics } from "@smog/analytics/react";
import { type Locale, MAX_GESTURES_PER_CHECKOUT } from "@smog/config/constants";
import { useMutation } from "@tanstack/react-query";
import { useReducer } from "react";
import type { AvailabilityState } from "../schema/availability";
import { type Price, priceSponsorship } from "../schema/pricing";
import { normalizeBelgianVat } from "../schema/vat";
import {
  type CheckoutFormInput,
  type CheckoutResult,
  COMPANY_MAX,
  CONTACT_NAME_MAX,
  contactEmailSchema,
  displayNameSchema,
  INVOICE_NAME_MAX,
} from "../schema/wizard";
import { useSponsorshipsClient } from "./slice";
import { logoFileError, useLogoUpload } from "./use-logo-upload";

/** A gesture in the selection: what the later steps show of it. */
export interface WizardGesture {
  id: string;
  name: string;
  playbackId: string;
  slug: string;
}

/** A `?gesture=` candidate with its availability (ruling 13). */
export interface PreselectGesture extends WizardGesture {
  state: AvailabilityState;
}

/** 0 Choose gestures, 1 Your details, 2 Preview & pay. */
export type WizardStep = 0 | 1 | 2;

/** The form of step 2, as typed (parsed only when checking out). */
export interface WizardDetails {
  company: string;
  contactEmail: string;
  contactName: string;
  displayName: string;
  /** The logo add-on; unticking keeps the file but does not send it. */
  includeLogo: boolean;
  invoiceEmail: string;
  invoiceName: string;
  vatNumber: string;
  wantsInvoice: boolean;
}

export interface WizardState {
  /** A v4 UUID per attempt; it becomes `payment.id` (ruling 5). */
  checkoutId: string;
  details: WizardDetails;
  /** The last toggle hit the cap of 10 (the explanation shows). */
  limitReached: boolean;
  /** The chosen file, kept while the box is unticked. */
  logo: Blob | null;
  selected: WizardGesture[];
  step: WizardStep;
  /** Gestures the checkout answered `GESTURE_UNAVAILABLE` for. */
  taken: string[];
}

export type WizardAction =
  | { gesture: WizardGesture; type: "toggle" }
  | { gestures: readonly PreselectGesture[]; type: "preselect" }
  | { step: WizardStep; type: "step" }
  | { patch: Partial<WizardDetails>; type: "details" }
  | { logo: Blob | null; type: "logo" }
  | { gestureIds: readonly string[]; type: "unavailable" }
  | { checkoutId: string; type: "newAttempt" };

export const EMPTY_DETAILS: WizardDetails = {
  company: "",
  contactEmail: "",
  contactName: "",
  displayName: "",
  includeLogo: false,
  invoiceEmail: "",
  invoiceName: "",
  vatNumber: "",
  wantsInvoice: false,
};

export function createWizardState(checkoutId: string): WizardState {
  return {
    checkoutId,
    details: EMPTY_DETAILS,
    limitReached: false,
    logo: null,
    selected: [],
    step: 0,
    taken: [],
  };
}

function toggle(state: WizardState, gesture: WizardGesture): WizardState {
  if (state.selected.some((item) => item.id === gesture.id)) {
    return {
      ...state,
      limitReached: false,
      selected: state.selected.filter((item) => item.id !== gesture.id),
    };
  }
  if (state.taken.includes(gesture.id)) {
    return state;
  }
  if (state.selected.length >= MAX_GESTURES_PER_CHECKOUT) {
    return { ...state, limitReached: true };
  }
  return {
    ...state,
    limitReached: false,
    selected: [...state.selected, gesture],
  };
}

function preselect(
  state: WizardState,
  gestures: readonly PreselectGesture[]
): WizardState {
  // S-03: only into an empty selection, and only what can be sponsored.
  if (state.selected.length > 0) {
    return state;
  }
  const seen = new Set<string>();
  const selected: WizardGesture[] = [];
  for (const { state: availability, ...gesture } of gestures) {
    if (
      availability === "available" &&
      !state.taken.includes(gesture.id) &&
      !seen.has(gesture.id) &&
      selected.length < MAX_GESTURES_PER_CHECKOUT
    ) {
      seen.add(gesture.id);
      selected.push(gesture);
    }
  }
  return selected.length === 0 ? state : { ...state, selected };
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case "toggle":
      return toggle(state, action.gesture);
    case "preselect":
      return preselect(state, action.gestures);
    case "step":
      return { ...state, step: action.step };
    case "details":
      return { ...state, details: { ...state.details, ...action.patch } };
    case "logo":
      return { ...state, logo: action.logo };
    case "unavailable": {
      const ids = new Set(action.gestureIds);
      return {
        ...state,
        limitReached: false,
        selected: state.selected.filter((item) => !ids.has(item.id)),
        step: 0,
        taken: [...new Set([...state.taken, ...action.gestureIds])],
      };
    }
    default:
      return { ...state, checkoutId: action.checkoutId };
  }
}

/** The wizard's state and dispatch; a fresh `checkoutId` per mount. */
export function useWizard() {
  return useReducer(wizardReducer, undefined, () =>
    createWizardState(crypto.randomUUID())
  );
}

/** The selection's price (`priceSponsorship`, as the server); `null` when empty. */
export function wizardPrice(state: WizardState): Price | null {
  if (state.selected.length === 0) {
    return null;
  }
  return priceSponsorship({
    count: state.selected.length,
    logo: state.details.includeLogo,
  });
}

/** The fields of step 2 that can be wrong. */
export type DetailsField =
  | "company"
  | "contactEmail"
  | "contactName"
  | "displayName"
  | "invoiceEmail"
  | "invoiceName"
  | "logo"
  | "vatNumber";

/** Why: the site maps each to its copy (`sponsor.details.errors.*`). */
export type DetailsError =
  | "invalid"
  | "logoTooLarge"
  | "logoType"
  | "required"
  | "tooLong";

export type DetailsErrors = Partial<Record<DetailsField, DetailsError>>;

function textError(value: string, max: number): DetailsError | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "required";
  }
  return trimmed.length > max ? "tooLong" : undefined;
}

function emailError(value: string): DetailsError | undefined {
  if (value.trim() === "") {
    return "required";
  }
  return contactEmailSchema.safeParse(value).success ? undefined : "invalid";
}

/** The name in the video as the server checks it (1..35, one line). */
export function displayNameError(value: string): DetailsError | undefined {
  const result = displayNameSchema.safeParse(value);
  if (result.success) {
    return;
  }
  const [issue] = result.error.issues;
  if (issue?.code === "too_small") {
    return "required";
  }
  return issue?.code === "too_big" ? "tooLong" : "invalid";
}

/**
 * The details as the server will check them (the shared schemas): an
 * empty object when they can be sent. Errors sit on their fields.
 */
export function validateDetails(
  details: WizardDetails,
  logo: Blob | null
): DetailsErrors {
  const errors: DetailsErrors = {
    company:
      details.company.trim().length > COMPANY_MAX ? "tooLong" : undefined,
    contactEmail: emailError(details.contactEmail),
    contactName: textError(details.contactName, CONTACT_NAME_MAX),
    displayName: displayNameError(details.displayName),
  };
  if (details.includeLogo) {
    errors.logo = logo ? (logoFileError(logo) ?? undefined) : "required";
  }
  if (details.wantsInvoice) {
    errors.invoiceName = textError(details.invoiceName, INVOICE_NAME_MAX);
    errors.invoiceEmail = emailError(details.invoiceEmail);
    if (details.vatNumber.trim() === "") {
      errors.vatNumber = "required";
    } else if (normalizeBelgianVat(details.vatNumber) === null) {
      errors.vatNumber = "invalid";
    }
  }
  return Object.fromEntries(
    Object.entries(errors).filter(([, error]) => error !== undefined)
  ) as DetailsErrors;
}

/**
 * What `sponsorships.checkout` gets. The logo key only when the box is
 * ticked; the invoice only when asked for; the total from
 * `priceSponsorship`, only a consistency check on the server.
 */
export function checkoutInput(
  state: WizardState,
  { locale, logoKey }: { locale: Locale; logoKey: string | null }
): CheckoutFormInput {
  const { details } = state;
  const includeLogo = details.includeLogo && logoKey !== null;
  const company = details.company.trim();
  return {
    checkoutId: state.checkoutId,
    contact: {
      ...(company ? { company } : {}),
      email: details.contactEmail.trim(),
      name: details.contactName.trim(),
    },
    displayName: details.displayName.trim(),
    expectedTotalCents: priceSponsorship({
      count: state.selected.length,
      logo: details.includeLogo,
    }).totalCents,
    gestureIds: state.selected.map((gesture) => gesture.id),
    ...(details.wantsInvoice
      ? {
          invoice: {
            email: details.invoiceEmail.trim(),
            name: details.invoiceName.trim(),
            vatNumber: details.vatNumber.trim(),
          },
        }
      : {}),
    locale,
    ...(includeLogo ? { logoKey } : {}),
  };
}

export interface CheckoutRequest {
  locale: Locale;
  state: WizardState;
  /** The Turnstile widget's token (single use); none in dev. */
  turnstileToken: string | null;
}

export interface UseCheckoutOptions {
  /** Sends the browser to Mollie (`location.assign` on the web). */
  onRedirect: (checkoutUrl: string) => void;
}

/**
 * "Continue to payment": uploads the logo when it is sent, calls
 * `sponsorships.checkout` with the Turnstile token, tracks
 * `sponsorship_checkout_started { gesture_count, has_logo }` once the call
 * succeeds, then redirects. Errors (`GESTURE_UNAVAILABLE`,
 * `INVALID_STATE`, …) reach the caller as the mutation's error.
 */
export function useCheckout({ onRedirect }: UseCheckoutOptions) {
  const client = useSponsorshipsClient();
  const analytics = useAnalytics();
  const upload = useLogoUpload();
  return useMutation({
    mutationFn: async ({
      locale,
      state,
      turnstileToken,
    }: CheckoutRequest): Promise<CheckoutResult> => {
      const logo = state.details.includeLogo ? state.logo : null;
      const logoKey = logo ? await upload.mutateAsync(logo) : null;
      const input = checkoutInput(state, { locale, logoKey });
      return await client.checkout(input, {
        context: { turnstileToken: turnstileToken ?? undefined },
      });
    },
    onSuccess: (result, { state }) => {
      analytics.track({
        name: "sponsorship_checkout_started",
        properties: {
          gesture_count: state.selected.length,
          has_logo: state.details.includeLogo && state.logo !== null,
        },
      });
      onRedirect(result.checkoutUrl);
    },
  });
}
