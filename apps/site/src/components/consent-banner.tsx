import {
  useConsent,
  useConsentChoice,
  useConsentPrompt,
} from "@smog/account/client";
import { useTranslation } from "@smog/i18n/react";
import { ConsentBanner, Switch, useToast } from "@smog/ui-web";
import { type ReactNode, useCallback } from "react";
import { useReservedSpace } from "@/lib/use-reserved-space";

const PRIVACY_HREF = "/privacy";

/** The toast for a decision that could not be saved (the prompt stays). */
function useSaveFailed(): () => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(() => {
    toast({ title: t("consent.saveFailed"), variant: "danger" });
  }, [t, toast]);
}

/**
 * The analytics consent banner (inventory P-05), fixed at the bottom while
 * the decision is open (`useConsentPrompt`): not during SSR, before the
 * device store has loaded, or while the guest import is offered.
 */
export function SiteConsentBanner(): ReactNode {
  const onSaveFailed = useSaveFailed();
  const prompt = useConsentPrompt({ onSaveFailed });
  const space = useReservedSpace();
  const { allow, decline } = prompt;
  const onAllow = useCallback(() => {
    allow();
  }, [allow]);
  const onDecline = useCallback(() => {
    decline();
  }, [decline]);
  if (!prompt.open) {
    return null;
  }
  return (
    <>
      <div aria-hidden="true" style={{ height: space.height }} />
      <ConsentBanner
        busy={prompt.busy}
        onAllow={onAllow}
        onDecline={onDecline}
        privacyHref={PRIVACY_HREF}
        ref={space.ref}
      />
    </>
  );
}

/** The same decision as a switch (the account page, guests included). */
export function AnalyticsSwitch(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const consent = useConsent();
  const onSaveFailed = useSaveFailed();
  const { busy, choose } = useConsentChoice({ onSaveFailed });
  const change = useCallback(
    async (checked: boolean): Promise<void> => {
      if (await choose(checked)) {
        toast({ title: t("consent.saved"), variant: "success" });
      }
    },
    [choose, t, toast]
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
