import { isDefinedError } from "@orpc/client";
import { useGesture, useRelated } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { EmptyState, ErrorState } from "@smog/ui-web";
import { type ReactNode, useCallback } from "react";
import { GestureDetailView, RELATED_LIMIT } from "./gesture-detail";
import { GestureDetailSkeleton } from "./gesture-detail-skeleton";
import type { Hearts } from "./use-hearts";

/** The browse page's detail column (desktop), for the selected slug. */
function SelectedDetail({
  hearts,
  slug,
}: {
  hearts: Hearts;
  slug: string;
}): ReactNode {
  const { t } = useTranslation();
  const gesture = useGesture(slug);
  const related = useRelated(slug, RELATED_LIMIT);
  const { refetch } = gesture;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  if (gesture.data) {
    return (
      <GestureDetailView
        gesture={gesture.data}
        hearts={hearts}
        layout="panel"
        related={related}
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
  hearts,
  slug,
}: {
  hearts: Hearts;
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
  return <SelectedDetail hearts={hearts} key={slug} slug={slug} />;
}
