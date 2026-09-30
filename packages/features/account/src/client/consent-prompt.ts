import { useCallback } from "react";
import {
  type ConsentChoiceOptions,
  useConsent,
  useConsentChoice,
} from "./use-consent";
import { useGuestImport } from "./use-guest-import";

export interface ConsentPrompt {
  allow: () => Promise<boolean>;
  /** A decision is being saved. */
  busy: boolean;
  decline: () => Promise<boolean>;
  /**
   * Show the prompt (web banner, mobile sheet): the decision is open
   * (`useConsent().needsDecision`) and no guest import is offered, so the
   * import sheet and the prompt never show at once (the import carries a
   * device choice anyway).
   */
  open: boolean;
}

/** The consent prompt's state and choices, for both apps. */
export function useConsentPrompt(
  options: ConsentChoiceOptions = {}
): ConsentPrompt {
  const consent = useConsent();
  const { pending } = useGuestImport();
  const { busy, choose } = useConsentChoice(options);
  const allow = useCallback(() => choose(true), [choose]);
  const decline = useCallback(() => choose(false), [choose]);
  return {
    allow,
    busy,
    decline,
    open:
      consent.status === "ready" && consent.needsDecision && pending === null,
  };
}
