import type { GestureViewSource } from "@smog/analytics/schema";
import { COURSE_URL } from "@smog/config/constants";
import { useGestureViewed, useVideoEnd } from "@smog/gestures/client";
import type { GestureDetail, GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { webAdapter } from "@smog/local-store/web";
import {
  Badge,
  Button,
  COURSE_MESSAGE_COUNT,
  CourseBanner,
  type CourseMessageIndex,
  cn,
  ErrorState,
  Heading,
  Text,
  VideoPlayer,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { GestureActions } from "./gesture-actions";
import { GestureGridSkeleton, LinkedGestureGrid } from "./gesture-cards";
import type { Hearts } from "./use-hearts";

/** Related gestures on a detail (spec §7 `gestures.related`, max 20). */
export const RELATED_LIMIT = 6;

export interface RelatedState {
  data: GestureSummary[] | undefined;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => unknown;
}

function Related({
  hearts,
  level,
  related,
}: {
  hearts: Hearts;
  level: 2 | 3;
  related: RelatedState;
}): ReactNode {
  const { t } = useTranslation();
  const { refetch } = related;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  let body: ReactNode;
  if (related.isError) {
    body = (
      <ErrorState
        level={level === 2 ? 3 : 4}
        onRetry={retry}
        retrying={related.isRefetching}
      />
    );
  } else if (related.data === undefined) {
    body = <GestureGridSkeleton count={4} />;
  } else if (related.data.length === 0) {
    return null;
  } else {
    body = (
      <LinkedGestureGrid
        from="related_gestures"
        hearts={hearts}
        items={related.data}
        level={level === 2 ? 3 : 4}
      />
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <Heading level={level}>{t("gesture.related")}</Heading>
      {body}
    </section>
  );
}

/**
 * A gesture: the video on top (3:4, the course banner under it when due),
 * then the name, its categories (links to the filtered browse), the
 * actions, the sponsor credit, description, related concepts and related
 * gestures (spec §16 flow 1). `page` puts the video beside the text from
 * `lg`; `panel` stacks everything (the browse page's detail column).
 * `viewSource` is where it was opened from (`gesture_viewed`, once per
 * gesture shown). `appLink` goes under the actions (the page's "Open in
 * the app" on phones).
 */
export function GestureDetailView({
  appLink,
  gesture,
  hearts,
  layout,
  related,
  viewSource,
}: {
  appLink?: ReactNode;
  gesture: GestureDetail;
  hearts: Hearts;
  layout: "page" | "panel";
  related: RelatedState;
  viewSource: GestureViewSource;
}): ReactNode {
  const { t } = useTranslation();
  const page = layout === "page";
  // The page's name is its h1; in the browse panel the page title is.
  const titleLevel = page ? 1 : 2;
  const sectionLevel = page ? 2 : 3;
  useGestureViewed(gesture.id, viewSource);
  // video_playback_completed and the course banner, once per visit.
  const { banner: course, onNearEnd } = useVideoEnd<CourseMessageIndex>({
    gestureId: gesture.id,
    messageCount: COURSE_MESSAGE_COUNT,
    storage: webAdapter,
  });
  return (
    <div className="flex flex-col gap-10">
      <article
        className={cn(
          "grid gap-6",
          page && "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10"
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-md flex-col gap-4",
            page && "lg:mx-0 lg:max-w-none"
          )}
        >
          <VideoPlayer
            onNearEnd={onNearEnd}
            playbackId={gesture.playbackId}
            title={gesture.name}
          />
          {course.messageIndex ? (
            <CourseBanner
              courseUrl={COURSE_URL}
              messageIndex={course.messageIndex}
              onDismiss={course.dismiss}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Heading level={titleLevel} size="title-1">
              {gesture.name}
            </Heading>
            {gesture.categories.length > 0 ? (
              <ul
                aria-label={t("search.categories")}
                className="flex flex-wrap gap-2"
              >
                {gesture.categories.map((category) => (
                  <li key={category.slug}>
                    <Button asChild size="sm" variant="secondary">
                      <Link search={{ category: category.slug }} to="/gestures">
                        {category.name}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <GestureActions gesture={gesture} hearts={hearts} />
          {appLink}
          {gesture.sponsor ? (
            <Text size="body-sm" tone="muted">
              {t("gesture.sponsoredBy", { name: gesture.sponsor.name })}
            </Text>
          ) : null}
          {gesture.description ? (
            <section className="flex max-w-reading flex-col gap-2">
              <Heading level={sectionLevel} size="title-3">
                {t("gesture.description")}
              </Heading>
              <Text>{gesture.description}</Text>
            </section>
          ) : null}
          {gesture.keywords.length > 0 ? (
            <section className="flex flex-col gap-2">
              <Heading level={sectionLevel} size="title-3">
                {t("gesture.keywords")}
              </Heading>
              <ul className="flex flex-wrap gap-2">
                {gesture.keywords.map((keyword) => (
                  <li key={keyword}>
                    <Badge size="md">{keyword}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </article>
      <Related hearts={hearts} level={sectionLevel} related={related} />
    </div>
  );
}
