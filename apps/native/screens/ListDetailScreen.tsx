import { Ionicons } from "@expo/vector-icons";
import { MenuView } from "@react-native-menu/menu";
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
    userId && list ? { userId, listId } : "skip"
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
          userId,
          listId: list._id,
          gestureIds: nextGestures.map(
            (candidate) => candidate.id as Id<"gestures">
          ),
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
          userId,
          listId: list._id,
          gestureId: gesture.id as Id<"gestures">,
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

  const renderGesture = useCallback(
    ({ drag, getIndex, isActive, item }: RenderItemParams<Gesture>) => {
      const index =
        getIndex() ??
        orderedGestures.findIndex((candidate) => candidate.id === item.id);
      const isPending = pendingGestureId === item.id;
      return (
        <View
          style={[
            styles.gestureRow,
            { backgroundColor: theme.card, borderColor: theme.border },
            isActive ? styles.gestureRowActive : null,
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.72}
            onPress={() => router.push(`/gestures/${item.id}`)}
            style={styles.gestureMain}
          >
            <View
              style={[
                styles.gestureMark,
                { backgroundColor: `${theme.primary}14` },
              ]}
            >
              <Text style={[styles.gestureMarkText, { color: theme.primary }]}>
                {item.name.slice(0, 1).toLocaleUpperCase()}
              </Text>
            </View>
            <View style={styles.gestureCopy}>
              <Text
                numberOfLines={1}
                style={[styles.gestureName, { color: theme.text }]}
              >
                {item.name}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.gestureMeta, { color: theme.textLight }]}
              >
                {item.category.slice(0, 3).join(" · ") ||
                  t("lists.uncategorized")}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel={t("lists.dragToReorder")}
            accessibilityRole="button"
            disabled={isActive || isReordering || Boolean(pendingGestureId)}
            hitSlop={HIT_SLOP.md}
            onLongPress={drag}
            style={[
              styles.dragHandle,
              isActive || isReordering || pendingGestureId
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
                  id: "up",
                  title: t("lists.moveUp"),
                  image: Platform.select({
                    ios: "arrow.up",
                    android: "arrow_upward",
                  }),
                  attributes: { disabled: index === 0 },
                },
                {
                  id: "down",
                  title: t("lists.moveDown"),
                  image: Platform.select({
                    ios: "arrow.down",
                    android: "arrow_downward",
                  }),
                  attributes: {
                    disabled: index === orderedGestures.length - 1,
                  },
                },
                {
                  id: "remove",
                  title: t("lists.removeGesture"),
                  image: Platform.select({
                    ios: "trash",
                    android: "ic_menu_delete",
                  }),
                  attributes: { destructive: true },
                },
              ]}
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "up") {
                  moveGesture(item, -1);
                } else if (nativeEvent.event === "down") {
                  moveGesture(item, 1);
                } else if (nativeEvent.event === "remove") {
                  removeGesture(item);
                }
              }}
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
    },
    [
      isReordering,
      moveGesture,
      orderedGestures,
      pendingGestureId,
      removeGesture,
      router,
      t,
      theme,
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
        onPress={() => router.navigate("/(tabs)/search")}
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
          title: displayName,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <TouchableOpacity
              accessibilityLabel={t("lists.listSettings")}
              hitSlop={HIT_SLOP.md}
              onPress={() =>
                router.push({
                  pathname: "/lists/[id]/settings",
                  params: { id: String(listId) },
                })
              }
            >
              <Ionicons
                color={Platform.OS === "ios" ? theme.primary : theme.background}
                name="settings-outline"
                size={23}
              />
            </TouchableOpacity>
          ),
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
          keyExtractor={(gesture) => gesture.id}
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
  emptyContent: {
    flexGrow: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
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
  gestureCopy: {
    flex: 1,
  },
  gestureName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  gestureMeta: {
    fontSize: FONT_SIZE.xs,
    marginTop: 4,
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
  rowAction: {
    alignItems: "center",
    height: 60,
    justifyContent: "center",
    width: 54,
  },
  empty: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    alignItems: "center",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    marginBottom: SPACING.md,
    width: 68,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: "center",
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    marginTop: SPACING.sm,
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
});
