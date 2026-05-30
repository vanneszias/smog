import { Ionicons } from "@expo/vector-icons";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { BORDER_RADIUS, FONT_SIZE, SPACING } from "@smog/styles";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HeaderMenuButton } from "@/components/common";
import BaseButton from "@/components/common/BaseButton";
import BaseInput from "@/components/common/BaseInput";
import SearchResults from "@/components/search/SearchResults";
import { useConvexUserId } from "@/context/ConvexUserSync";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import type { Gesture } from "@/types";

interface GestureListRecord {
  _id: Id<"gesture_lists">;
  name: string;
  visibility: "private" | "shared";
  allowSharedEditing: boolean;
  isDefaultFavorites: boolean;
}

const FavoritesScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const userId = useConvexUserId();
  const [activeListId, setActiveListId] = useState<Id<"gesture_lists"> | null>(
    null
  );
  const [newListName, setNewListName] = useState("");
  const [isAddingGestures, setIsAddingGestures] = useState(false);
  const [searchText, setSearchText] = useState("");

  const initializeUserLists = useMutation(api.lists.initializeUserLists);
  const createList = useMutation(api.lists.createList);
  const deleteList = useMutation(api.lists.deleteList);
  const addGestureToList = useMutation(api.lists.addGestureToList);
  const removeGestureFromList = useMutation(api.lists.removeGestureFromList);

  const lists = useQuery(
    api.lists.listUserLists,
    userId ? { userId } : "skip"
  ) as GestureListRecord[] | undefined;
  const activeGestures = useQuery(
    api.lists.getListGesturesForNative,
    userId && activeListId ? { userId, listId: activeListId } : "skip"
  ) as Gesture[] | undefined;
  const allGestures = useQuery(api.gestures.listForNative, {
    limit: 500,
  }) as Gesture[] | undefined;

  const activeList = useMemo(
    () => lists?.find((list) => list._id === activeListId) ?? null,
    [activeListId, lists]
  );

  const activeGestureIds = useMemo(
    () => new Set((activeGestures ?? []).map((gesture) => gesture.id)),
    [activeGestures]
  );

  const addableGestures = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return (allGestures ?? [])
      .filter((gesture) => !activeGestureIds.has(gesture.id))
      .filter((gesture) => {
        if (!query) {
          return true;
        }
        return [
          gesture.name,
          gesture.info,
          ...gesture.concept,
          ...gesture.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [activeGestureIds, allGestures, searchText]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    initializeUserLists({ userId }).catch(() => {
      // The existing provider also initializes lists; this is just a screen-level safety net.
    });
  }, [initializeUserLists, userId]);

  useEffect(() => {
    if (!(lists && lists.length > 0)) {
      setActiveListId(null);
      return;
    }
    setActiveListId((current) =>
      current && lists.some((list) => list._id === current)
        ? current
        : lists[0]?._id
    );
  }, [lists]);

  const handleGesturePress = useCallback(
    (gesture: Gesture) => {
      router.push(`/gestures/${gesture.id}`);
    },
    [router]
  );

  const navigateToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleAboutPress = useCallback(() => {
    Linking.openURL("https://smog.vlaanderen");
  }, []);

  const handleContactPress = useCallback(() => {
    Linking.openURL("mailto:hello@smog.vlaanderen");
  }, []);

  const createNewList = async () => {
    const name = newListName.trim();
    if (!(userId && name)) {
      return;
    }
    const listId = await createList({
      userId,
      name,
      visibility: "private",
      allowSharedEditing: false,
    });
    setNewListName("");
    setActiveListId(listId);
  };

  const confirmDeleteList = () => {
    if (!(userId && activeList && !activeList.isDefaultFavorites)) {
      return;
    }
    Alert.alert(t("lists.deleteTitle"), t("lists.deleteMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteList({ userId, listId: activeList._id });
        },
      },
    ]);
  };

  const addGesture = async (gestureId: string) => {
    if (!(userId && activeListId)) {
      return;
    }
    await addGestureToList({
      userId,
      listId: activeListId,
      gestureId: gestureId as Id<"gestures">,
    });
  };

  const removeGesture = async (gestureId: string) => {
    if (!(userId && activeListId)) {
      return;
    }
    await removeGestureFromList({
      userId,
      listId: activeListId,
      gestureId: gestureId as Id<"gestures">,
    });
  };

  const isIOS = Platform.OS === "ios";

  const menuActions = [
    {
      id: "settings",
      title: t("settings.title"),
      image: Platform.select({
        ios: "gearshape",
        android: "ic_menu_preferences",
      }),
    },
    {
      id: "about",
      title: t("about.title"),
      image: Platform.select({
        ios: "info.circle",
        android: "ic_menu_info_details",
      }),
    },
    {
      id: "contact",
      title: t("contact.title"),
      image: Platform.select({
        ios: "phone",
        android: "ic_menu_call",
      }),
    },
  ];

  const handleMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (nativeEvent.event === "settings") {
        navigateToSettings();
      }
      if (nativeEvent.event === "about") {
        handleAboutPress();
      }
      if (nativeEvent.event === "contact") {
        handleContactPress();
      }
    },
    [navigateToSettings, handleAboutPress, handleContactPress]
  );

  const header = (
    <View style={styles.header}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.listTabs}
      >
        {(lists ?? []).map((list) => {
          const isActive = list._id === activeListId;
          return (
            <TouchableOpacity
              key={list._id}
              onPress={() => setActiveListId(list._id)}
              style={[
                styles.listTab,
                {
                  backgroundColor: isActive ? theme.primary : theme.card,
                  borderColor: isActive ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.listTabText,
                  { color: isActive ? theme.background : theme.text },
                ]}
              >
                {list.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.createRow}>
        <BaseInput
          containerStyle={styles.createInput}
          onChangeText={setNewListName}
          placeholder={t("lists.newListPlaceholder")}
          value={newListName}
        />
        <BaseButton
          disabled={!newListName.trim()}
          onPress={createNewList}
          size="small"
          title={t("lists.create")}
        />
      </View>
      {activeList ? (
        <View style={styles.actionsRow}>
          <BaseButton
            onPress={() => setIsAddingGestures((current) => !current)}
            size="small"
            title={isAddingGestures ? t("lists.doneAdding") : t("lists.add")}
            variant={isAddingGestures ? "secondary" : "primary"}
          />
          {activeList.isDefaultFavorites ? null : (
            <BaseButton
              onPress={confirmDeleteList}
              size="small"
              title={t("common.delete")}
              variant="outline"
            />
          )}
        </View>
      ) : null}
      {isAddingGestures ? (
        <BaseInput
          onChangeText={setSearchText}
          placeholder={t("lists.searchToAdd")}
          value={searchText}
        />
      ) : null}
    </View>
  );

  return (
    <View
      collapsable={false}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{
          title: t("tabs.lists"),
          ...(isIOS
            ? {
                headerLargeTitle: true,
                headerLargeTitleStyle: {
                  color: theme.text,
                },
                headerStyle: {
                  backgroundColor: theme.background,
                },
                headerTransparent: true,
                headerBlurEffect: "systemChromeMaterial",
                headerShadowVisible: false,
                headerRight: () => (
                  <HeaderMenuButton
                    actions={menuActions}
                    onPressAction={(event) =>
                      handleMenuAction({ nativeEvent: { event } })
                    }
                  />
                ),
              }
            : {
                headerStyle: {
                  backgroundColor: theme.primary,
                },
                headerTintColor: theme.background,
                headerTitleStyle: {
                  fontWeight: "bold",
                  fontSize: 20,
                },
                headerRight: () => (
                  <HeaderMenuButton
                    actions={menuActions}
                    onPressAction={(event) =>
                      handleMenuAction({ nativeEvent: { event } })
                    }
                  />
                ),
              }),
        }}
      />

      {isAddingGestures ? (
        <SearchResults
          isFavorite={(gestureId) => activeGestureIds.has(gestureId)}
          isLoading={!allGestures}
          ListHeaderComponent={header}
          onGesturePress={handleGesturePress}
          onToggleFavorite={addGesture}
          results={addableGestures}
          source="favorites_screen"
          style={styles.resultList}
        />
      ) : (activeGestures ?? []).length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScrollContent}
          style={styles.resultList}
        >
          {header}
          <View style={styles.emptyContainer}>
            <Ionicons
              color={theme.textLight}
              name="list-outline"
              size={64}
              style={styles.emptyIcon}
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t("lists.emptyTitle")}
            </Text>
            <Text style={[styles.emptyMessage, { color: theme.textLight }]}>
              {t("lists.emptyMessage")}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <SearchResults
          isFavorite={(gestureId) => activeGestureIds.has(gestureId)}
          isLoading={!activeGestures}
          ListHeaderComponent={header}
          onGesturePress={handleGesturePress}
          onToggleFavorite={removeGesture}
          results={activeGestures ?? []}
          source="favorites_screen"
          style={styles.resultList}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  resultList: {
    paddingHorizontal: SPACING.md,
  },
  header: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  listTabs: {
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  listTab: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginRight: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  listTabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "700",
  },
  createRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: SPACING.sm,
  },
  createInput: {
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  emptyScrollContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    marginBottom: SPACING.lg,
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "600",
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: FONT_SIZE.md,
    textAlign: "center",
    lineHeight: 22,
  },
});

export default FavoritesScreen;
