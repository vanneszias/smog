import type { GestureViewSource } from "@smog/analytics/schema";
import { useAuthState } from "@smog/auth/react";
import { COURSE_URL } from "@smog/config/constants";
import {
  useGestureViewed,
  useRememberGesture,
  useVideoEnd,
} from "@smog/gestures/client";
import {
  type GestureDetail,
  type GestureSummary,
  nameOverlayApplies,
} from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { webAdapter } from "@smog/local-store/web";
import {
  AudioButton,
  Badge,
  Button,
  COURSE_MESSAGE_COUNT,
  CourseBanner,
  type CourseMessageIndex,
  ErrorState,
  Heading,
  NameOverlayToggle,
  Text,
  VideoPlayer,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { SponsorCta } from "@/components/sponsor/sponsor-cta";
import { RELATED_LIMIT } from "@/lib/gesture-queries";
import { useNameOverlayPreference } from "@/lib/name-overlay";
import { useCatalogDisplay } from "./catalog-display";
import { GestureActions } from "./gesture-actions";
import { GestureGridSkeleton, LinkedGestureGrid } from "./gesture-cards";
import { Page } from "./page";
import type { Hearts } from "./use-hearts";

export interface RelatedState {
  data: GestureSummary[] | undefined;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => unknown;
}

/**
 * The related row's columns: six across on the page (two rows of three on a
 * tablet, three of two on a phone), three across in the browse panel, so
 * `RELATED_LIMIT` (6) never leaves an orphan. The skeleton uses the same.
 */
function relatedGrid(level: 2 | 3): string {
  return level === 2
    ? "lg:grid-cols-6 xl:grid-cols-6"
    : "lg:grid-cols-3 xl:grid-cols-3";
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
    body = (
      <GestureGridSkeleton
        className={relatedGrid(level)}
        count={RELATED_LIMIT}
      />
    );
  } else if (related.data.length === 0) {
    return null;
  } else {
    body = (
      <LinkedGestureGrid
        className={relatedGrid(level)}
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
 * The sponsor end card over the video's last seconds (phase 10b ruling 9):
 * none without a running sponsorship, nor over a rendered video that
 * already carries the name.
 */
function endCardOf(
  gesture: GestureDetail
): { logoSrc: string | null; name: string } | undefined {
  const { sponsor } = gesture;
  return sponsor?.endCard
    ? { logoSrc: sponsor.logoPath, name: sponsor.name }
    : undefined;
}

/**
 * A link to the gesture's private teaching text (phase 10c) for a teacher, a
 * translator or an admin; nothing for anyone else.
 */
function TeacherInfoLink({
  gestureId,
  roles,
}: {
  gestureId: string;
  roles: readonly string[];
}): ReactNode {
  const { t } = useTranslation();
  if (
    !["admin", "teacher", "translator"].some((role) => roles.includes(role))
  ) {
    return null;
  }
  return (
    <div>
      <Button asChild size="sm" variant="secondary">
        <Link params={{ id: gestureId }} to="/admin/teacher-info/$id">
          {t("admin.teacherInfo.open")}
        </Link>
      </Button>
    </div>
  );
}

/** The video on the stage: 3:4, as tall as a laptop screen allows. */
export const STAGE_VIDEO = "mx-auto w-full max-w-sm md:max-w-md";

/** The text and the sponsor card under the stage. */
export const PAGE_COLUMNS =
  "grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16";

/**
 * A gesture: the video (3:4) on the deep green stage, the same green as
 * the backdrop of the videos, then the course banner when due, the name,
 * its categories (quiet tinted links to the filtered browse), the actions,
 * description, related concepts, the sponsor card (L-17: the credit, or
 * "Sponsor this gesture") and related gestures (spec §16 flow 1). `page`
 * runs the stage across the full width under the header, with the sponsor
 * card beside the text from `lg`; `panel` insets the stage and stacks
 * everything (the browse page's detail column).
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
  // Only translators and admins see that the text is still the default
  // language's (a learner just reads it).
  const roles = useAuthState().user?.roles ?? [];
  const showTranslationStatus =
    gesture.fallbackUsed &&
    (roles.includes("admin") || roles.includes("translator"));
  // The name over the video: only on a textless video (the picture of an
  // older one already carries it) and unless this viewer hid it.
  const nameOverlay = useNameOverlayPreference();
  const overlayApplies = nameOverlayApplies(gesture);
  const page = layout === "page";
  // The page's name is its h1; in the browse panel the page title is.
  const titleLevel = page ? 1 : 2;
  const sectionLevel = page ? 2 : 3;
  useGestureViewed(gesture.id, viewSource);
  // Home's "continue where you left off" (this device only).
  useRememberGesture(gesture.id);
  // video_playback_completed and the course banner, once per visit.
  const { banner: course, onNearEnd } = useVideoEnd<CourseMessageIndex>({
    gestureId: gesture.id,
    messageCount: COURSE_MESSAGE_COUNT,
    storage: webAdapter,
  });
  const shown = useCatalogDisplay().gesture(gesture);
  const video = (
    <VideoPlayer
      endCard={endCardOf(gesture)}
      nameOverlay={
        overlayApplies && nameOverlay.loaded && nameOverlay.shown
          ? gesture.name
          : undefined
      }
      onNearEnd={onNearEnd}
      playbackId={gesture.playbackId}
      title={gesture.name}
    />
  );
  const details = (
    <div className="flex min-w-0 flex-col gap-6">
      {course.messageIndex ? (
        <CourseBanner
          courseUrl={COURSE_URL}
          messageIndex={course.messageIndex}
          onDismiss={course.dismiss}
        />
      ) : null}
      <div className="flex flex-col gap-3">
        <Heading
          lang={shown.nameLang}
          level={titleLevel}
          size={page ? "display" : "title-1"}
        >
          {gesture.name}
        </Heading>
        {showTranslationStatus ? (
          <Badge variant="warning">{t("admin.catalogTranslation.needs")}</Badge>
        ) : null}
        <TeacherInfoLink gestureId={gesture.id} roles={roles} />
        {shown.categories.length > 0 ? (
          <ul
            aria-label={t("search.categories")}
            className="flex flex-wrap gap-2"
          >
            {shown.categories.map((category) => (
              <li key={category.slug}>
                {/* What this is, not what you can do: the quiet green tint. */}
                <Button
                  asChild
                  className="bg-primary-subtle text-primary-strong hover:bg-primary-subtle/70 hover:text-primary-strong"
                  size="sm"
                  variant="ghost"
                >
                  <Link search={{ category: category.slug }} to="/gestures">
                    {category.name}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {gesture.audioPath || overlayApplies ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* A clip of this language only; never a fallback. */}
          {gesture.audioPath ? <AudioButton src={gesture.audioPath} /> : null}
          {overlayApplies ? (
            <NameOverlayToggle
              checked={nameOverlay.shown}
              onCheckedChange={nameOverlay.setShown}
            />
          ) : null}
        </div>
      ) : null}
      <GestureActions gesture={gesture} hearts={hearts} />
      {appLink}
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
  );
  const sponsor = <SponsorCta gesture={gesture} level={sectionLevel} />;
  const relatedRow = (
    <Related hearts={hearts} level={sectionLevel} related={related} />
  );
  if (!page) {
    // The browse panel: the same green stage, inset, then everything stacked.
    return (
      <div className="flex flex-col gap-8">
        <div className="flex justify-center rounded-card bg-sidebar p-4 md:p-6">
          <div className="w-full max-w-sm">{video}</div>
        </div>
        {details}
        {/* Last: it mounts after its read, so nothing above moves. */}
        {sponsor}
        {relatedRow}
      </div>
    );
  }
  return (
    <>
      <div className="bg-sidebar" data-slot="gesture-stage">
        <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6 md:py-10 lg:px-8">
          <div className={STAGE_VIDEO}>{video}</div>
        </div>
      </div>
      <Page className="gap-12 md:gap-16">
        <div className={PAGE_COLUMNS}>
          {details}
          {/* Beside the text from `lg`; it mounts after its read. */}
          <div className="flex min-w-0 flex-col">{sponsor}</div>
        </div>
        {relatedRow}
      </Page>
    </>
  );
}
