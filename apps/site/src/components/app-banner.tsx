import { useConsent } from "@smog/account/client";
import { APP_STORE_URL, PLAY_STORE_URL } from "@smog/config/constants";
import { dismissAppBanner } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { AppBanner, OpenInAppBanner } from "@smog/ui-web";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  followOpenInAppPlan,
  openInAppPlan,
  useMobilePlatform,
} from "@/lib/open-in-app";
import { useSiteUrl } from "@/lib/share";

/** True once the device store has been read (its defaults hide nothing). */
function useStoreLoaded(): boolean {
  const store = useLocalStoreInstance();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    store.ready
      .then(() => {
        if (active) {
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        console.error("[appBanner] Failed to load the local store:", error);
      });
    return () => {
      active = false;
    };
  }, [store]);
  return loaded;
}

/**
 * The app promotion on the home page (inventory L-16): mobile browsers
 * only, once the consent decision is made (so the two prompts never
 * stack), until it is dismissed on this device (`preferences`
 * `.appBannerDismissedAt` in the local store). Nothing renders on the
 * server or before hydration.
 */
export function SiteAppBanner({
  className,
}: {
  className?: string;
}): ReactNode {
  const platform = useMobilePlatform();
  const consent = useConsent();
  const loaded = useStoreLoaded();
  const dismissedAt = useLocalStore(
    (data) => data.preferences.appBannerDismissedAt
  );
  const store = useLocalStoreInstance();
  const dismiss = useCallback((): void => {
    store.update(dismissAppBanner()).catch((error: unknown) => {
      console.error("[appBanner] Failed to save the dismissal:", error);
    });
  }, [store]);
  const decided = consent.status === "ready" && !consent.needsDecision;
  if (!(platform && decided && loaded) || dismissedAt !== undefined) {
    return null;
  }
  return (
    <AppBanner
      appStoreUrl={APP_STORE_URL}
      className={className}
      googlePlayUrl={PLAY_STORE_URL}
      onDismiss={dismiss}
    />
  );
}

/**
 * "Open in the app" on a gesture page (inventory L-15), on iOS and
 * Android browsers only. The link is the page's universal link; a click
 * goes through the app scheme (`openInAppPlan`), since a universal link to
 * the current site stays in the browser.
 */
export function OpenInApp({ path }: { path: string }): ReactNode {
  const platform = useMobilePlatform();
  const siteUrl = useSiteUrl();
  const open = useCallback(
    (event: MouseEvent<HTMLAnchorElement>): void => {
      const plan = platform ? openInAppPlan(path, platform) : null;
      if (plan) {
        event.preventDefault();
        followOpenInAppPlan(plan);
      }
    },
    [path, platform]
  );
  if (platform !== "ios" && platform !== "android") {
    return null;
  }
  return <OpenInAppBanner href={`${siteUrl}${path}`} onOpen={open} />;
}
