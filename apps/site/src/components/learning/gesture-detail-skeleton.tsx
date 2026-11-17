import { useTranslation } from "@smog/i18n/react";
import { Skeleton } from "@smog/ui-web";
import type { ReactNode } from "react";
import { PAGE_COLUMNS, STAGE_VIDEO } from "./gesture-detail";
import { Page } from "./page";

/** The video's place on the green stage while it loads. */
function StageSkeleton(): ReactNode {
  return (
    <Skeleton
      className="aspect-3/4 h-auto w-full bg-sidebar-accent"
      shape="rect"
    />
  );
}

function TextSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-1/2" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="w-full" />
      <Skeleton className="w-5/6" />
    </div>
  );
}

/**
 * The detail's shape while it loads (decorative; the region is busy), in
 * the same stage and columns as `GestureDetailView`, so nothing moves when
 * the gesture lands.
 */
export function GestureDetailSkeleton({
  layout = "page",
}: {
  layout?: "page" | "panel";
}): ReactNode {
  const { t } = useTranslation();
  const status = (
    <p className="sr-only" role="status">
      {t("states.loading")}
    </p>
  );
  if (layout === "panel") {
    return (
      <div aria-busy="true" className="flex flex-col gap-8">
        {status}
        <div className="flex justify-center rounded-card bg-sidebar p-4 md:p-6">
          <div className="w-full max-w-sm">
            <StageSkeleton />
          </div>
        </div>
        <TextSkeleton />
      </div>
    );
  }
  return (
    <div aria-busy="true" className="flex flex-1 flex-col">
      {status}
      <div className="bg-sidebar">
        <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6 md:py-10 lg:px-8">
          <div className={STAGE_VIDEO}>
            <StageSkeleton />
          </div>
        </div>
      </div>
      <Page className="gap-12 md:gap-16">
        <div className={PAGE_COLUMNS}>
          <TextSkeleton />
        </div>
      </Page>
    </div>
  );
}
