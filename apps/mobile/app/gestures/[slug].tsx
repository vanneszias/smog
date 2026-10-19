import { isDefinedError } from "@orpc/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COURSE_URL } from "@smog/config/constants";
import {
  gestureViewSource,
  useGesture,
  useGestureViewed,
  useRelated,
  useVideoEnd,
} from "@smog/gestures/client";
import type { GestureBySlug } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  Chip,
  COURSE_MESSAGE_COUNT,
  CourseBanner,
  type CourseMessageIndex,
  EmptyState,
  ErrorState,
  FavoriteButton,
  Heading,
  IconButton,
  Skeleton,
  Text,
  useToast,
  VideoPlayer,
} from "@smog/ui-native";
import {
  Stack,
  useIsFocused,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { addScreenshotListener } from "expo-screen-capture";
import Share2 from "lucide-react-native/icons/share-2";
import { type ReactElement, useCallback, useEffect } from "react";
import { Alert, ScrollView, View } from "react-native";
import { ConnectionBanner } from "@/components/connection-banner";
import {
  GestureRowItem,
  useOpenGesture,
  useToggleFavorite,
} from "@/components/gesture-cards";
import { SaveToList } from "@/components/save-to-list";
import { gestureUrl, shareUrl } from "@/lib/site";
import { SponsorCta } from "@/sponsor-cta";

/** Related gestures under the detail (the contract's default is 5). */
const RELATED_LIMIT = 5;

function useShareGesture(gesture: GestureBySlug | undefined): () => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(() => {
    if (!gesture) {
      return;
    }
    const url = gestureUrl(gesture.canonicalSlug);
    shareUrl({
      message: t("gesture.shareMessage", { name: gesture.name, url }),
      title: gesture.name,
      url,
    }).catch(() => {
      toast({ title: t("states.actionFailed"), variant: "danger" });
    });
  }, [gesture, t, toast]);
}

/**
 * The screenshot share prompt (P-24): a screenshot of a gesture offers
 * its link instead, so the video goes along. Only while this screen is
 * focused. Android 13 and below report nothing (the permissions are
 * stripped, see `plugins/with-screen-capture-permissions.js`).
 */
function useScreenshotPrompt(active: boolean, share: () => void): void {
  const { t } = useTranslation();
  useEffect(() => {
    if (!active) {
      return;
    }
    const subscription = addScreenshotListener(() => {
      Alert.alert(
        t("gesture.screenshot.title"),
        t("gesture.screenshot.message"),
        [
          { style: "cancel", text: t("gesture.screenshot.dismiss") },
          { onPress: share, text: t("gesture.screenshot.share") },
        ]
      );
    });
    return () => subscription.remove();
  }, [active, share, t]);
}

function RelatedGestures({ slug }: { slug: string }): ReactElement | null {
  const { t } = useTranslation();
  const related = useRelated(slug, RELATED_LIMIT);
  const open = useOpenGesture("related_gestures");
  const { isFavorite, toggle } = useToggleFavorite("gesture_detail");
  const items = related.data ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <View className="gap-1">
      <Heading level={2} size="title-3">
        {t("gesture.related")}
      </Heading>
      {items.map((item) => (
        <GestureRowItem
          favorite={isFavorite(item.id)}
          gesture={item}
          key={item.id}
          onFavorite={toggle}
          onOpen={open}
        />
      ))}
    </View>
  );
}

/** A category chip that opens the search filtered by it. */
function CategoryLink({
  name,
  onOpen,
  slug,
}: {
  name: string;
  onOpen: (slug: string) => void;
  slug: string;
}): ReactElement {
  const open = useCallback(() => onOpen(slug), [onOpen, slug]);
  return <Chip onPress={open}>{name}</Chip>;
}

function GestureDetail({
  gesture,
  isFocused,
}: {
  gesture: GestureBySlug;
  isFocused: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  // video_playback_completed and the course banner, once per visit.
  const { banner: course, onNearEnd } = useVideoEnd<CourseMessageIndex>({
    gestureId: gesture.id,
    messageCount: COURSE_MESSAGE_COUNT,
    storage: AsyncStorage,
  });
  const openCategory = useCallback(
    (category: string) =>
      router.navigate({ params: { category }, pathname: "/search" }),
    [router]
  );
  return (
    <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-2">
      <ConnectionBanner className="mx-0" />
      <VideoPlayer
        autoPlay
        isFocused={isFocused}
        loop
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
      <View className="gap-2">
        <Heading level={1} size="title-2">
          {gesture.name}
        </Heading>
        {gesture.categories.length > 0 ? (
          <View
            accessibilityLabel={t("search.categories")}
            className="flex-row flex-wrap gap-3 pt-1"
          >
            {gesture.categories.map((category) => (
              <CategoryLink
                key={category.slug}
                name={category.name}
                onOpen={openCategory}
                slug={category.slug}
              />
            ))}
          </View>
        ) : null}
      </View>
      {gesture.description ? (
        <View className="gap-2">
          <Heading level={2} size="title-3">
            {t("gesture.about")}
          </Heading>
          <Text>{gesture.description}</Text>
        </View>
      ) : null}
      {gesture.keywords.length > 0 ? (
        <View className="gap-2">
          <Heading level={2} size="title-3">
            {t("gesture.keywords")}
          </Heading>
          <View className="flex-row flex-wrap gap-2">
            {gesture.keywords.map((keyword) => (
              <Badge key={keyword}>{keyword}</Badge>
            ))}
          </View>
        </View>
      ) : null}
      <SponsorCta gesture={gesture} />
      <RelatedGestures slug={gesture.canonicalSlug} />
    </ScrollView>
  );
}

/**
 * A gesture, as a card over the tabs: the video on top, then the name,
 * categories (open the search with that category), description, related
 * concepts and related gestures. The header has the heart, "Save to list"
 * and share. A legacy id resolves through `gestures.bySlug`.
 */
export default function GestureScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { from, slug = "" } = useLocalSearchParams<{
    from?: string;
    slug: string;
  }>();
  const isFocused = useIsFocused();
  const gesture = useGesture(slug);
  const { data, isRefetching, refetch } = gesture;
  useGestureViewed(data?.id, gestureViewSource(from));
  const { isFavorite, toggle } = useToggleFavorite("gesture_detail");
  const share = useShareGesture(data);
  useScreenshotPrompt(isFocused && data !== undefined, share);
  const dataId = data?.id;
  const toggleThis = useCallback(() => {
    if (dataId) {
      toggle(dataId);
    }
  }, [dataId, toggle]);
  const goHome = useCallback(() => router.navigate("/"), [router]);
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[gesture] Failed to reload:", error);
    });
  }, [refetch]);

  const headerRight = useCallback(
    () =>
      data ? (
        <View className="flex-row items-center">
          <FavoriteButton active={isFavorite(data.id)} onToggle={toggleThis} />
          <SaveToList gestureId={data.id} gestureName={data.name} />
          <IconButton
            icon={<Share2 />}
            label={t("gesture.share")}
            onPress={share}
            variant="ghost"
          />
        </View>
      ) : null,
    [data, isFavorite, share, t, toggleThis]
  );

  const notFound =
    isDefinedError(gesture.error) && gesture.error.code === "NOT_FOUND";
  let content: ReactElement;
  if (data) {
    content = <GestureDetail gesture={data} isFocused={isFocused} />;
  } else if (notFound) {
    content = (
      <EmptyState
        action={
          <Button onPress={goHome} variant="secondary">
            {t("states.notFound.action")}
          </Button>
        }
        description={t("gesture.notFound.description")}
        title={t("gesture.notFound.title")}
      />
    );
  } else if (gesture.isError) {
    content = <ErrorState onRetry={retry} retrying={isRefetching} />;
  } else {
    content = (
      <View className="gap-4 px-4 pt-2" testID="gesture-loading">
        <Skeleton className="h-auto w-full rounded-lg" style={VIDEO_STYLE} />
        <Skeleton className="w-1/2" shape="text" />
        <Skeleton className="w-full" shape="text" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="gesture-screen">
      <Stack.Screen options={{ headerRight, title: data?.name ?? "" }} />
      {content}
    </View>
  );
}

const VIDEO_STYLE = { aspectRatio: 3 / 4 } as const;
