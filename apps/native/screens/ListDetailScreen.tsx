import Ionicons from "@expo/vector-icons/Ionicons";
import { MenuView, type NativeActionEvent } from "@react-native-menu/menu";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  HIT_SLOP,
  SPACING,
} from "@smog/styles";
import { useMutation, useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { useConvexUserId } from "@/context/ConvexUserSync";
import { useLists } from "@/context/ListsContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";
import type { Gesture } from "@/types";
import { moveListItem } from "@/utils/listOrdering";
import logger from "@/utils/logger";

const keyExtractor = (gesture: Gesture): string => gesture.id;

interface ListGestureRowProps {
  drag: () => void;
  gesture: Gesture;
  hasPendingGesture: boolean;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  isReordering: boolean;
  onMove: (gesture: Gesture, direction: -1 | 1) => Promise<void>;
  onOpen: (gestureId: string) => void;
  onRemove: (gesture: Gesture) => Promise<void>;
}

function ListGestureRow({
  drag,
  gesture,
  hasPendingGesture,
  isActive,
  isFirst,
  isLast,
  isPending,
  isReordering,
  onMove,
  onOpen,
  onRemove,
}: ListGestureRowProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    onOpen(gesture.id);
  }, [onOpen, gesture.id]);

  const handlePressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent): void => {
      if (nativeEvent.event === "up") {
        onMove(gesture, -1);
      } else if (nativeEvent.event === "down") {
        onMove(gesture, 1);
      } else if (nativeEvent.event === "remove") {
        onRemove(gesture);
      }
    },
    [onMove, onRemove, gesture]
  );

  return (
    <View
      style={[
        styles.gestureRow,
        { backgroundColor: theme.card, borderColor: theme.border },
        isActive ? styles.gestureRowActive : null,
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.72}
        onPress={handlePress}
        style={styles.gestureMain}
      >
        <View
          style={[
            styles.gestureMark,
            { backgroundColor: `${theme.primary}14` },
          ]}
        >
          <Text style={[styles.gestureMarkText, { color: theme.primary }]}>
            {gesture.name.slice(0, 1).toLocaleUpperCase()}
          </Text>
        </View>
        <View style={styles.gestureCopy}>
          <Text
            numberOfLines={1}
            style={[styles.gestureName, { color: theme.text }]}
          >
            {gesture.name}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.gestureMeta, { color: theme.textLight }]}
          >
            {gesture.category.slice(0, 3).join(" · ") ||
              t("lists.uncategorized")}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityLabel={t("lists.dragToReorder")}
        accessibilityRole="button"
        disabled={isActive || isReordering || hasPendingGesture}
        hitSlop={HIT_SLOP.md}
        onLongPress={drag}
        style={[
          styles.dragHandle,
          isActive || isReordering || hasPendingGesture
            ? styles.dragHandleDisabled
            : null,
        ]}
      >
        <Ionicons
          color={theme.textLight}
          name="reorder-three-outline"
          size={24}
        />
      </TouchableOpacity>

      {isPending ? (
        <ActivityIndicator
          color={theme.primary}
          size="small"
          style={styles.rowAction}
        />
      ) : (
        <MenuView
          actions={[
            {
              attributes: { disabled: isFirst },
              id: "up",
              image: Platform.select({
                android: "arrow_upward",
                ios: "arrow.up",
              }),
              title: t("lists.moveUp"),
            },
            {
              attributes: {
                disabled: isLast,
              },
              id: "down",
              image: Platform.select({
                android: "arrow_downward",
                ios: "arrow.down",
              }),
              title: t("lists.moveDown"),
            },
            {
              attributes: { destructive: true },
              id: "remove",
              image: Platform.select({
                android: "ic_menu_delete",
                ios: "trash",
              }),
              title: t("lists.removeGesture"),
            },
          ]}
          onPressAction={handlePressAction}
          shouldOpenOnLongPress={false}
        >
          <View style={styles.rowAction}>
            <Ionicons
              color={theme.textLight}
              name="ellipsis-horizontal"
              size={22}
            />
          </View>
        </MenuView>
      )}
    </View>
  );
}

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = id as Id<"gesture_lists">;
  const router = useRouter();
  const userId = useConvexUserId();
  const { lists } = useLists();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { triggerHaptic, triggerSelection } = useNativeInteractions();
  const [orderedGestures, setOrderedGestures] = useState<Gesture[]>([]);
  const [pendingGestureId, setPendingGestureId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const list = useMemo(
    () => lists?.find((candidate) => candidate._id === listId) ?? null,
    [listId, lists]
  );
  const serverGestures = useQuery(
    api.lists.getListGesturesForNative,
    userId && list ? { listId, userId } : "skip"
  ) as Gesture[] | undefined;
  const removeGestureFromList = useMutation(api.lists.removeGestureFromList);
  const reorderListItems = useMutation(api.lists.reorderListItems);

  const displayName = list?.isDefaultFavorites
    ? t("lists.favorites")
    : (list?.name ?? t("tabs.lists"));

  useEffect(() => {
    if (serverGestures) {
      setOrderedGestures(serverGestures);
    }
  }, [serverGestures]);

  const persistGestureOrder = useCallback(
    async (nextGestures: Gesture[], previousGestures: Gesture[]) => {
      if (!(userId && list) || isReordering) {
        return;
      }

      setIsReordering(true);
      try {
        await reorderListItems({
          gestureIds: nextGestures.map(
            (candidate) => candidate.id as Id<"gestures">
          ),
          listId: list._id,
          userId,
        });
        triggerSelection();
      } catch (error) {
        logger.error("[lists] Failed to reorder gestures:", error);
        setOrderedGestures(previousGestures);
        triggerHaptic("error");
        showToast(t("lists.reorderFailed"));
      } finally {
        setIsReordering(false);
      }
    },
    [
      isReordering,
      list,
      reorderListItems,
      showToast,
      t,
      triggerHaptic,
      triggerSelection,
      userId,
    ]
  );

  const removeGesture = useCallback(
    async (gesture: Gesture) => {
      if (!(userId && list) || pendingGestureId || isReordering) {
        return;
      }

      setPendingGestureId(gesture.id);
      try {
        await removeGestureFromList({
          gestureId: gesture.id as Id<"gestures">,
          listId: list._id,
          userId,
        });
        triggerSelection();
        showToast(t("lists.gestureRemoved"));
      } catch (error) {
        logger.error("[lists] Failed to remove gesture:", error);
        triggerHaptic("error");
        showToast(t("lists.removeFailed"));
      } finally {
        setPendingGestureId(null);
      }
    },
    [
      isReordering,
      list,
      pendingGestureId,
      removeGestureFromList,
      showToast,
      t,
      triggerHaptic,
      triggerSelection,
      userId,
    ]
  );

  const moveGesture = useCallback(
    async (gesture: Gesture, direction: -1 | 1) => {
      if (!(userId && list) || pendingGestureId || isReordering) {
        return;
      }

      const previousGestures = orderedGestures;
      const currentIndex = previousGestures.findIndex(
        (candidate) => candidate.id === gesture.id
      );
      const nextGestures = moveListItem(
        previousGestures,
        currentIndex,
        direction
      );
      if (
        nextGestures.every(
          (candidate, index) => candidate.id === previousGestures[index]?.id
        )
      ) {
        return;
      }

      setOrderedGestures(nextGestures);
      setPendingGestureId(gesture.id);
      await persistGestureOrder(nextGestures, previousGestures);
      setPendingGestureId(null);
    },
    [
      isReordering,
      list,
      orderedGestures,
      pendingGestureId,
      persistGestureOrder,
      userId,
    ]
  );

  const handleDragEnd = useCallback(
    async ({ data }: { data: Gesture[] }) => {
      if (!(userId && list) || pendingGestureId || isReordering) {
        return;
      }
      if (
        data.every(
          (gesture, index) => gesture.id === orderedGestures[index]?.id
        )
      ) {
        return;
      }

      const previousGestures = orderedGestures;
      setOrderedGestures(data);
      await persistGestureOrder(data, previousGestures);
    },
    [
      isReordering,
      list,
      orderedGestures,
      pendingGestureId,
      persistGestureOrder,
      userId,
    ]
  );

  const handleOpenGesture = useCallback(
    (gestureId: string): void => {
      router.push(`/gestures/${gestureId}`);
    },
    [router]
  );

  const handleExplore = useCallback(() => {
    router.navigate("/(tabs)/search");
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    router.push({
      params: { id: String(listId) },
      pathname: "/lists/[id]/settings",
    });
  }, [router, listId]);

  const renderGesture = useCallback(
    ({ drag, getIndex, isActive, item }: RenderItemParams<Gesture>) => {
      const index =
        getIndex() ??
        orderedGestures.findIndex((candidate) => candidate.id === item.id);
      return (
        <ListGestureRow
          drag={drag}
          gesture={item}
          hasPendingGesture={Boolean(pendingGestureId)}
          isActive={isActive}
          isFirst={index === 0}
          isLast={index === orderedGestures.length - 1}
          isPending={pendingGestureId === item.id}
          isReordering={isReordering}
          onMove={moveGesture}
          onOpen={handleOpenGesture}
          onRemove={removeGesture}
        />
      );
    },
    [
      handleOpenGesture,
      isReordering,
      moveGesture,
      orderedGestures,
      pendingGestureId,
      removeGesture,
    ]
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <View
        style={[styles.emptyIcon, { backgroundColor: `${theme.primary}12` }]}
      >
        <Ionicons color={theme.primary} name="list-outline" size={34} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {t("lists.emptyTitle")}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textLight }]}>
        {t("lists.emptyMessage")}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={handleExplore}
        style={[styles.exploreButton, { backgroundColor: theme.primary }]}
      >
        <Ionicons color="#ffffff" name="search" size={19} />
        <Text style={styles.exploreButtonText}>
          {t("lists.exploreGestures")}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <TouchableOpacity
              accessibilityLabel={t("lists.listSettings")}
              accessibilityRole="button"
              hitSlop={HIT_SLOP.md}
              onPress={handleOpenSettings}
            >
              <Ionicons
                color={Platform.OS === "ios" ? theme.primary : theme.background}
                name="settings-outline"
                size={23}
              />
            </TouchableOpacity>
          ),
          title: displayName,
        }}
      />

      {serverGestures === undefined ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <DraggableFlatList
          contentContainerStyle={[
            styles.content,
            orderedGestures.length === 0 ? styles.emptyContent : null,
          ]}
          contentInsetAdjustmentBehavior={
            Platform.OS === "ios" ? "automatic" : undefined
          }
          data={orderedGestures}
          keyExtractor={keyExtractor}
          ListEmptyComponent={renderEmpty}
          onDragEnd={handleDragEnd}
          renderItem={renderGesture}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  dragHandle: {
    alignItems: "center",
    height: 60,
    justifyContent: "center",
    width: 44,
  },
  dragHandleDisabled: {
    opacity: 0.45,
  },
  empty: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyContent: {
    flexGrow: 1,
  },
  emptyIcon: {
    alignItems: "center",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    marginBottom: SPACING.md,
    width: 68,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: "center",
  },
  exploreButton: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.round,
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  exploreButtonText: {
    color: "#ffffff",
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  gestureCopy: {
    flex: 1,
  },
  gestureMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gestureMark: {
    alignItems: "center",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginRight: 12,
    width: 42,
  },
  gestureMarkText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  gestureMeta: {
    fontSize: FONT_SIZE.xs,
    marginTop: 4,
  },
  gestureName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  gestureRow: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginBottom: SPACING.sm,
    minHeight: 72,
  },
  gestureRowActive: {
    opacity: 0.92,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  rowAction: {
    alignItems: "center",
    height: 60,
    justifyContent: "center",
    width: 54,
  },
});
