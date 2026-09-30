import {
  useConsent,
  useConsentChoice,
  useConsentPrompt,
} from "@smog/account/client";
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

/** The toast for a decision that could not be saved (the prompt stays). */
function useSaveFailed(): () => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(() => {
    toast({ title: t("consent.saveFailed"), variant: "danger" });
  }, [t, toast]);
}

/**
 * The consent sheet (spec §10, inventory P-06): shown on launch while the
 * decision is open (`useConsentPrompt`), after the guest import sheet.
 * Dismissing it leaves the decision open and hides it until the next
 * launch; nothing is sent meanwhile.
 */
export function ConsentSheet(): ReactElement | null {
  const onSaveFailed = useSaveFailed();
  const prompt = useConsentPrompt({ onSaveFailed });
  const [dismissed, setDismissed] = useState(false);
  const { allow, decline } = prompt;
  const onAllow = useCallback(() => {
    allow();
  }, [allow]);
  const onDecline = useCallback(() => {
    decline();
  }, [decline]);
  const dismiss = useCallback(() => setDismissed(true), []);
  if (!prompt.open || dismissed) {
    return null;
  }
  return (
    <ConsentBanner
      busy={prompt.busy}
      onAllow={onAllow}
      onDecline={onDecline}
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
