import { useTranslation } from "@smog/i18n/react";
import { useLessonList } from "@smog/lessons/client";
import type { LessonListItem } from "@smog/lessons/schema";
import {
  Badge,
  EmptyState,
  ErrorState,
  ListItem,
  Skeleton,
  Spinner,
  useColor,
} from "@smog/ui-native";
import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import GraduationCap from "lucide-react-native/icons/graduation-cap";
import { type ReactElement, useCallback, useMemo } from "react";
import { FlatList, type ListRenderItemInfo, View } from "react-native";
import {
  LIST_CONTENT,
  ListScreen,
  ListState,
  ListTop,
} from "@/components/screen";
import { type AppQueryUtils, useRetry } from "@/lib/retry";
import { LessonGate } from "./lesson-gate";

const lessonQueries = (rpc: AppQueryUtils) => [rpc.lessons.key()];

/** The list filter: everything, newest change first (the "mine" filter is a builder matter). */
const ALL = { mine: false, query: "" } as const;

function LessonRow({
  lesson,
  onOpen,
}: {
  lesson: LessonListItem;
  onOpen: (id: string) => void;
}): ReactElement {
  const { i18n, t } = useTranslation();
  const muted = useColor("mutedForeground");
  const { id } = lesson;
  const open = useCallback(() => onOpen(id), [id, onOpen]);
  const parts = [
    lesson.number === null
      ? null
      : t("teacherLessons.number", { number: lesson.number }),
    t("teacherLessons.gestureCount", { count: lesson.gestureCount }),
    lesson.authorName
      ? t("teacherLessons.author", { name: lesson.authorName })
      : null,
  ].filter((part): part is string => part !== null);
  // The title is in the default language when the app's has none: say so.
  const fallback = lesson.titleLocale !== i18n.language;
  return (
    <ListItem
      description={parts.join(" · ")}
      leading={<GraduationCap color={muted} />}
      onPress={open}
      testID={`lesson-row-${lesson.id}`}
      title={lesson.title}
      trailing={
        <View className="flex-row items-center gap-2">
          {fallback ? (
            <Badge
              accessibilityLabel={t("teacherLessons.titleIn", {
                language: lesson.titleLocale,
              })}
            >
              {lesson.titleLocale.toUpperCase()}
            </Badge>
          ) : null}
          <ChevronRight color={muted} />
        </View>
      }
    />
  );
}

function keyOf(lesson: LessonListItem): string {
  return lesson.id;
}

function LessonList(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const retry = useRetry(lessonQueries);
  const list = useLessonList(ALL);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = list;
  const lessons = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data]
  );
  const open = useCallback(
    (id: string) =>
      router.push({ params: { id }, pathname: "/settings/lessons/[id]" }),
    [router]
  );
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<LessonListItem>) => (
      <LessonRow lesson={item} onOpen={open} />
    ),
    [open]
  );
  const more = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage().catch((error: unknown) => {
        console.error("[lessons] Failed to load more lessons:", error);
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (list.isPending) {
    return (
      <ListState>
        <View className="gap-3 px-4" testID="lessons-loading">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </View>
      </ListState>
    );
  }
  if (list.isError && lessons.length === 0) {
    return (
      <ListState>
        <ErrorState onRetry={retry} />
      </ListState>
    );
  }
  return (
    <FlatList
      contentContainerClassName={LIST_CONTENT}
      contentInsetAdjustmentBehavior="automatic"
      data={lessons}
      keyExtractor={keyOf}
      ListEmptyComponent={
        <EmptyState
          description={t("teacherLessons.empty.description")}
          title={t("teacherLessons.empty.title")}
        />
      }
      ListFooterComponent={isFetchingNextPage ? <Spinner /> : null}
      ListHeaderComponent={<ListTop />}
      onEndReached={more}
      renderItem={renderRow}
    />
  );
}

/** The signed-in teacher's view of every lesson (read only; lessons are made on the website). */
export function LessonListScreen(): ReactElement {
  return (
    <ListScreen testID="lessons-screen">
      <LessonGate>
        <LessonList />
      </LessonGate>
    </ListScreen>
  );
}
