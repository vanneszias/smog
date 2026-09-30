import {
  useConsent,
  useConsentChoice,
  useConsentPrompt,
} from "@smog/account/client";
import { useTranslation } from "@smog/i18n/react";
import { ConsentBanner, Switch, useToast } from "@smog/ui-web";
import { type ReactNode, useCallback, useEffect, useState } from "react";

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
 * While the banner shows, the page keeps room for it at the bottom (WCAG
 * 2.4.11): an in-flow spacer of its height, so the footer can be scrolled
 * into view, and `scroll-padding-bottom`, so focus is never scrolled under it.
 */
function useReservedSpace(): {
  height: number;
  ref: (element: HTMLElement | null) => void;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element) {
      setHeight(0);
      return;
    }
    const measure = (): void => setHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingBottom = height > 0 ? `${height}px` : "";
    return () => {
      root.style.scrollPaddingBottom = "";
    };
  }, [height]);
  return { height, ref: setElement };
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
