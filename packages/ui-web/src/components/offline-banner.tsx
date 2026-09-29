import { useTranslation } from "@smog/i18n/react";
import { WifiOff } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { cn } from "../lib/cn";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** `navigator.onLine`, live. Online on the server and during hydration. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}

export interface OfflineBannerProps
  extends Omit<ComponentProps<"div">, "children"> {
  /** Controlled connectivity (native passes NetInfo); browser events when omitted. */
  online?: boolean;
}

/** Shown while the network is lost (`states.offline.*`); a polite status message. */
export function OfflineBanner({
  className,
  online,
  ...props
}: OfflineBannerProps): ReactNode {
  const { t } = useTranslation();
  const browserOnline = useOnline();
  if (online ?? browserOnline) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md bg-warning-subtle px-4 py-3 text-warning-strong",
        className
      )}
      role="status"
      {...props}
    >
      <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p className="flex flex-col text-body-sm">
        <span className="font-semibold">{t("states.offline.title")}</span>
        <span className="text-foreground">
          {t("states.offline.description")}
        </span>
      </p>
    </div>
  );
}
