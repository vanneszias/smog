import { useConsent, useConsentChoice } from "@smog/account/client";
import { useTranslation } from "@smog/i18n/react";
import { ConsentBanner, Switch, useToast } from "@smog/ui-native";
import { type ReactElement, useCallback, useState } from "react";
import { Linking } from "react-native";
import { privacyUrl } from "@/lib/site";

/** Opens the site's privacy policy in the browser. */
export function openPrivacy(): void {
  Linking.openURL(privacyUrl()).catch((error: unknown) => {
    console.error("[consent] Failed to open the privacy policy:", error);
  });
}

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
 * The consent sheet (spec §10, inventory P-06): shown on launch while the
 * analytics decision is open. Dismissing it leaves the decision open and
 * hides it until the next launch; nothing is sent meanwhile.
 */
export function ConsentSheet(): ReactElement | null {
  const consent = useConsent();
  const { busy, decide } = useDecide();
  const [dismissed, setDismissed] = useState(false);
  const allow = useCallback(() => {
    decide(true);
  }, [decide]);
  const decline = useCallback(() => {
    decide(false);
  }, [decide]);
  const dismiss = useCallback(() => setDismissed(true), []);
  if (consent.status !== "ready" || !consent.needsDecision || dismissed) {
    return null;
  }
  return (
    <ConsentBanner
      busy={busy}
      onAllow={allow}
      onDecline={decline}
      onDismiss={dismiss}
      onOpenPrivacy={openPrivacy}
      open
      testID="consent-banner"
    />
  );
}

/** The same decision as a switch (settings and the account screen). */
export function AnalyticsSwitch(): ReactElement {
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
