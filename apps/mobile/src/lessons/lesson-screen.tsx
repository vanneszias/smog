import { isDefinedError } from "@orpc/client";
import { useTranslation } from "@smog/i18n/react";
import { useLesson } from "@smog/lessons/client";
import type { LessonItem } from "@smog/lessons/schema";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Heading,
  ListItem,
  Skeleton,
  Text,
  useColor,
} from "@smog/ui-native";
import { useLocalSearchParams } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import FileDown from "lucide-react-native/icons/file-down";
import { type ReactElement, useCallback, useState } from "react";
import { View } from "react-native";
import { ConnectionBanner } from "@/components/connection-banner";
import { useOpenGesture } from "@/components/gesture-cards";
import { ListScreen, ListState, ScreenScrollView } from "@/components/screen";
import { useRuntimeCatalogue } from "@/lib/catalogue";
import { type AppQueryUtils, useRetry } from "@/lib/retry";
import { ExportSheet } from "./export-sheet";
import { LessonGate } from "./lesson-gate";
import { pickText } from "./lesson-text";

function GestureLine({
  item,
  onOpen,
}: {
  item: LessonItem;
  onOpen: (slug: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const muted = useColor("mutedForeground");
  const { published, slug } = item;
  const open = useCallback(() => onOpen(slug), [onOpen, slug]);
  // An unpublished gesture has no page: it is kept in the lesson, flagged,
  // and left out of the PDF (the same as on the website).
  return (
    <ListItem
      description={published ? undefined : t("teacherLessons.unpublishedHint")}
      disabled={!published}
      onPress={published ? open : undefined}
      testID={`lesson-gesture-${item.id}`}
      title={item.name}
      trailing={
        published ? (
          <ChevronRight color={muted} />
        ) : (
          <Badge variant="warning">{t("teacherLessons.unpublished")}</Badge>
        )
      }
    />
  );
}

function Gestures({
  items,
  onOpen,
}: {
  items: readonly LessonItem[];
  onOpen: (slug: string) => void;
}): ReactElement {
  return (
    <View>
      {items.map((item) => (
        <GestureLine item={item} key={item.id} onOpen={onOpen} />
      ))}
    </View>
  );
}

const lessonQueries = (rpc: AppQueryUtils) => [rpc.lessons.key()];

function LessonBody({ id }: { id: string }): ReactElement {
  const { t } = useTranslation();
  const { languages, wanted } = useRuntimeCatalogue();
  const lesson = useLesson(id);
  const retry = useRetry(lessonQueries);
  const open = useOpenGesture("direct");
  const [exporting, setExporting] = useState(false);
  const startExport = useCallback(() => setExporting(true), []);
  const defaultLocale =
    languages.find((language) => language.isDefault)?.code ?? "nl";

  if (lesson.isPending) {
    return (
      <ListState>
        <View className="gap-3 px-4" testID="lesson-loading">
          <Skeleton className="h-8" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </View>
      </ListState>
    );
  }
  if (lesson.isError) {
    if (isDefinedError(lesson.error) && lesson.error.code === "NOT_FOUND") {
      return (
        <ListState>
          <EmptyState
            description={t("teacherLessons.notFound.description")}
            title={t("teacherLessons.notFound.title")}
          />
        </ListState>
      );
    }
    return (
      <ListState>
        <ErrorState onRetry={retry} />
      </ListState>
    );
  }
  const detail = lesson.data;
  const title =
    pickText(
      Object.fromEntries(
        Object.entries(detail.translations).map(([code, text]) => [
          code,
          text.title,
        ])
      ),
      wanted,
      defaultLocale
    ) ?? "";
  const notes = pickText(
    Object.fromEntries(
      Object.entries(detail.translations).map(([code, text]) => [
        code,
        text.notes,
      ])
    ),
    wanted,
    defaultLocale
  );
  const empty =
    detail.ungrouped.length === 0 &&
    detail.sections.every((section) => section.items.length === 0);
  return (
    <>
      <ScreenScrollView contentContainerClassName="gap-6">
        <ConnectionBanner className="mx-0" />
        <View className="gap-2">
          {detail.number === null ? null : (
            <Text size="body-sm" tone="muted">
              {t("teacherLessons.number", { number: detail.number })}
            </Text>
          )}
          <Heading level={1}>{title}</Heading>
          {detail.authorName ? (
            <Text size="body-sm" tone="muted">
              {t("teacherLessons.author", { name: detail.authorName })}
            </Text>
          ) : null}
        </View>
        <Button
          icon={<FileDown />}
          onPress={startExport}
          testID="lesson-export"
          variant="secondary"
        >
          {t("teacherLessons.export.open")}
        </Button>
        {notes ? (
          <View className="gap-1" testID="lesson-notes">
            <Heading level={2}>{t("teacherLessons.notes")}</Heading>
            <Text>{notes}</Text>
          </View>
        ) : null}
        {empty ? (
          <Text tone="muted">{t("teacherLessons.emptyLesson")}</Text>
        ) : null}
        {detail.ungrouped.length > 0 ? (
          <View className="gap-1">
            <Heading level={2}>{t("teacherLessons.ungrouped")}</Heading>
            <Gestures items={detail.ungrouped} onOpen={open} />
          </View>
        ) : null}
        {detail.sections.map((section) => (
          <View
            className="gap-1"
            key={section.id}
            testID={`lesson-section-${section.id}`}
          >
            <Heading level={2}>
              {pickText(section.titles, wanted, defaultLocale) ??
                t("teacherLessons.section")}
            </Heading>
            <Gestures items={section.items} onOpen={open} />
          </View>
        ))}
      </ScreenScrollView>
      <ExportSheet
        lessonId={id}
        onOpenChange={setExporting}
        open={exporting}
        version={detail.version}
      />
    </>
  );
}

/** One lesson, read only: its title and notes in the app's language, the sections and the gestures in order, and Export. */
export function LessonScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ListScreen testID="lesson-screen">
      <LessonGate>
        <LessonBody id={id} />
      </LessonGate>
    </ListScreen>
  );
}
