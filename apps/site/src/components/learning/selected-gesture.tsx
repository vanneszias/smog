import { isDefinedError } from "@orpc/client";
import { useGesture, useRelated } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { EmptyState, ErrorState } from "@smog/ui-web";
import { type ReactNode, useCallback, useEffect } from "react";
import { GestureDetailView, RELATED_LIMIT } from "./gesture-detail";
import { GestureDetailSkeleton } from "./gesture-detail-skeleton";
import { useHearts } from "./use-hearts";

/**
 * The browse page's detail column (desktop), for the selected slug: a
 * gesture opened from the results, with the detail's hearts.
 */
function SelectedDetail({ slug }: { slug: string }): ReactNode {
  const { t } = useTranslation();
  const hearts = useHearts("gesture_detail");
  const gesture = useGesture(slug);
  const related = useRelated(slug, RELATED_LIMIT);
  const { refetch } = gesture;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  // The URL reads `/gestures/<slug>` (masked): so does the tab title.
  const name = gesture.data?.name;
  useEffect(() => {
    if (!name) {
      return;
    }
    const previous = document.title;
    document.title = `${name} · ${t("common.appName")}`;
    return () => {
      document.title = previous;
    };
  }, [name, t]);
  if (gesture.data) {
    return (
      <GestureDetailView
        gesture={gesture.data}
        hearts={hearts}
        layout="panel"
        related={related}
        viewSource="search_results"
      />
    );
  }
  if (isDefinedError(gesture.error) && gesture.error.code === "NOT_FOUND") {
    return (
      <EmptyState
        description={t("states.notFound.description")}
        level={2}
        title={t("states.notFound.title")}
      />
    );
  }
  if (gesture.isError) {
    return (
      <ErrorState level={2} onRetry={retry} retrying={gesture.isRefetching} />
    );
  }
  return <GestureDetailSkeleton layout="panel" />;
}

/**
 * The detail beside the results from `lg`: the selected gesture, or a
 * prompt to choose one.
 */
export function SelectedGesture({
  slug,
}: {
  slug: string | undefined;
}): ReactNode {
  const { t } = useTranslation();
  if (!slug) {
    return (
      <EmptyState
        description={t("gestures.select.description")}
        illustration={2}
        level={2}
        title={t("gestures.select.title")}
      />
    );
  }
  return <SelectedDetail key={slug} slug={slug} />;
}
