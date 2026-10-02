import { cn, OfflineBanner } from "@smog/ui-native";
import type { ReactElement } from "react";
import { useOnline } from "@/lib/network";

/** The kit's OfflineBanner on NetInfo; nothing while online. */
export function ConnectionBanner({
  className,
}: {
  className?: string;
}): ReactElement | null {
  const online = useOnline();
  return (
    <OfflineBanner
      className={cn("mx-4", className)}
      online={online}
      testID="offline-banner"
    />
  );
}
