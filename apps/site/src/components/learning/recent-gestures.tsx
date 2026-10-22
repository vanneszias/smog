import { useRecentGestures } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, Heading } from "@smog/ui-web";
import { type ReactNode, useCallback, useEffect } from "react";
import { GestureGridSkeleton, LinkedGestureGrid } from "./gesture-cards";
import { useHearts } from "./use-hearts";

/**
 * "Continue where you left off" (Home): the gestures this device opened
 * lately, from the local store (nothing leaves the device but the public
 * read of those gestures). It stays out of the way: nothing while there is
 * nothing to continue, and no error screen when the read fails (a
 * convenience; the featured gestures below are the page).
 */
export function RecentGestures(): ReactNode {
  const { t } = useTranslation();
  const recent = useRecentGestures();
  const hearts = useHearts();
  const { clear } = recent;
  const failed = recent.status === "error";
  useEffect(() => {
    if (failed) {
      console.error("[home] Failed to load the recent gestures");
    }
  }, [failed]);
  const clearAll = useCallback((): void => {
    clear().catch((error: unknown) => {
      console.error("[home] Failed to clear the recent gestures:", error);
    });
  }, [clear]);
  if (recent.status === "empty" || failed) {
    return null;
  }
  const ready = recent.status === "ready";
  if (ready && recent.gestures.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2} size="title-2">
          {t("landing.continue")}
        </Heading>
        <Button
          aria-label={t("landing.clearRecent")}
          onClick={clearAll}
          variant="ghost"
        >
          {t("landing.clear")}
        </Button>
      </div>
      {ready ? (
        <LinkedGestureGrid
          className="xl:grid-cols-6"
          hearts={hearts}
          items={recent.gestures}
          level={3}
        />
      ) : (
        <GestureGridSkeleton count={4} />
      )}
    </section>
  );
}
