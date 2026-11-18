import { useTranslation } from "@smog/i18n/react";
import { OfflineBanner } from "@smog/ui-web";
import type { ReactNode } from "react";

/**
 * The web's offline state (identity overhaul, C): a calm banner at the top
 * of the page column while the browser is offline, saying what still works
 * here. The site has no service worker, so what is on screen stays and the
 * next page, search and the videos wait for the connection. It is in the
 * page (not a fixed bar), so it never stacks over a bottom bar. Nothing on
 * the server or during hydration (`useOnline` is online there).
 */
export function OfflineNotice(): ReactNode {
  const { t } = useTranslation();
  return <OfflineBanner description={t("stateActions.offline.web")} />;
}
