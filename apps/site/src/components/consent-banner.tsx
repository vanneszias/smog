import { useConsent, useConsentChoice } from "@smog/account/client";
import { useTranslation } from "@smog/i18n/react";
import { ConsentBanner, Switch, useToast } from "@smog/ui-web";
import { type ReactNode, useCallback } from "react";

const PRIVACY_HREF = "/privacy";

/** Saves a decision; a failure is a toast and leaves the decision open. */
function useDecide(): {
  busy: boolean;
  decide: (value: boolean) => Promise<boolean>;
} {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { busy, choose } = useConsentChoice();
  const decide = useCallback(
    async (value: boolean): Promise<boolean> => {
      const saved = await choose(value);
      if (!saved) {
        toast({ title: t("consent.saveFailed"), variant: "danger" });
      }
      return saved;
    },
    [choose, t, toast]
  );
  return { busy, decide };
}

/**
 * The analytics consent banner (inventory P-05), fixed at the bottom while
 * the decision is open: a first visit, or a yes under an older policy.
 * Nothing renders on the server or before the device store has loaded
 * (`useConsent` is `loading` then), so it never flashes for a visitor who
 * already decided.
 */
export function SiteConsentBanner(): ReactNode {
  const consent = useConsent();
  const { busy, decide } = useDecide();
  const allow = useCallback(() => {
    decide(true);
  }, [decide]);
  const decline = useCallback(() => {
    decide(false);
  }, [decide]);
  if (consent.status !== "ready" || !consent.needsDecision) {
    return null;
  }
  return (
    <ConsentBanner
      busy={busy}
      onAllow={allow}
      onDecline={decline}
      privacyHref={PRIVACY_HREF}
    />
  );
}

/** The same decision as a switch (the account page, guests included). */
export function AnalyticsSwitch(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const consent = useConsent();
  const { busy, decide } = useDecide();
  const change = useCallback(
    async (checked: boolean): Promise<void> => {
      if (await decide(checked)) {
        toast({ title: t("consent.saved"), variant: "success" });
      }
    },
    [decide, t, toast]
  );
  return (
    <Switch
      checked={consent.analytics === true}
      description={t("consent.toggleDescription")}
      disabled={consent.status !== "ready" || busy}
      label={t("consent.toggle")}
      onCheckedChange={change}
    />
  );
}
