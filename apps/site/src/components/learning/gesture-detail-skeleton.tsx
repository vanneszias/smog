import { useTranslation } from "@smog/i18n/react";
import { cn, Skeleton } from "@smog/ui-web";
import type { ReactNode } from "react";

/** The detail's shape while it loads (decorative; the region is busy). */
export function GestureDetailSkeleton({
  layout = "page",
}: {
  layout?: "page" | "panel";
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div
      aria-busy="true"
      className={cn(
        "grid gap-6",
        layout === "page" &&
          "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10"
      )}
    >
      <p className="sr-only" role="status">
        {t("states.loading")}
      </p>
      <Skeleton
        className="mx-auto aspect-3/4 h-auto w-full max-w-md lg:mx-0"
        shape="rect"
      />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="w-full" />
        <Skeleton className="w-5/6" />
      </div>
    </div>
  );
}
