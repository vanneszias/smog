import { isDefinedError } from "@orpc/client";
import { useGesture, useRelated } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  EmptyState,
  ErrorState,
  HandIllustration,
  Heading,
  Text,
} from "@smog/ui-web";
import { type ReactNode, useCallback, useEffect } from "react";
import { RELATED_LIMIT } from "@/lib/gesture-queries";
import { GestureDetailView } from "./gesture-detail";
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
    // The deep green stage the video will stand on, waiting: the open palm
    // (nothing here yet) and what to do.
    return (
      <div className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-card bg-sidebar px-8 py-12 text-center text-sidebar-foreground">
        <HandIllustration className="h-16 text-sidebar-foreground" hand={2} />
        <Heading className="text-sidebar-foreground" level={2} size="title-2">
          {t("gestures.select.title")}
        </Heading>
        <Text className="max-w-xs text-sidebar-foreground-muted">
          {t("gestures.select.description")}
        </Text>
      </div>
    );
  }
  return <SelectedDetail key={slug} slug={slug} />;
}
