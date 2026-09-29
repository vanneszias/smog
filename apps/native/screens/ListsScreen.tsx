import Ionicons from "@expo/vector-icons/Ionicons";
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HeaderMenuButton } from "@/components/common";
import { ListNameModal } from "@/components/lists/ListNameModal";
import type { GestureListRecord } from "@/context/ListsContext";
import { useLists } from "@/context/ListsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

const keyExtractor = (item: GestureListRecord): string => item._id;

interface ListCardProps {
  displayName: string;
  list: GestureListRecord;
  onOpen: (listId: string) => void;
}

function ListCard({ displayName, list, onOpen }: ListCardProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    onOpen(String(list._id));
  }, [onOpen, list._id]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.72}
      onPress={handlePress}
      style={[
        styles.listCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
      ]}
    >
      <View
        style={[
          styles.listIcon,
          {
            backgroundColor: list.isDefaultFavorites
              ? `${theme.liked}18`
              : `${theme.primary}14`,
          },
        ]}
      >
        <Ionicons
          color={list.isDefaultFavorites ? theme.liked : theme.primary}
          name={list.isDefaultFavorites ? "heart" : "list"}
          size={23}
        />
      </View>
      <View style={styles.listCopy}>
        <Text
          numberOfLines={1}
          style={[styles.listName, { color: theme.text }]}
        >
          {displayName}
        </Text>
        <Text style={[styles.listMeta, { color: theme.textLight }]}>
          {list.visibility === "shared"
            ? t("lists.shared")
            : t("lists.private")}
        </Text>
      </View>
      <Ionicons color={theme.textLight} name="chevron-forward" size={20} />
    </TouchableOpacity>
  );
}

export default function ListsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { createList, lists } = useLists();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const displayName = useCallback(
    (list: GestureListRecord) =>
      list.isDefaultFavorites ? t("lists.favorites") : list.name,
    [t]
  );

  const handleCreate = useCallback(
    async (name: string) => {
      setIsCreating(true);
      const listId = await createList(name);
      setIsCreating(false);
      if (listId) {
        setIsCreateOpen(false);
        router.push({
          params: { id: String(listId) },
          pathname: "/lists/[id]",
        });
      }
    },
    [createList, router]
  );

  const handleOpenList = useCallback(
    (listId: string): void => {
      router.push({
        params: { id: listId },
        pathname: "/lists/[id]",
      });
    },
    [router]
  );

  const handleMenuAction = useCallback(
    (action: string): void => {
      if (action === "new") {
        setIsCreateOpen(true);
      } else {
        router.push("/settings");
      }
    },
    [router]
  );

  const handleOpenCreate = useCallback(() => {
    setIsCreateOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setIsCreateOpen(false);
  }, []);

  const renderList = useCallback(
    ({ item }: { item: GestureListRecord }) => (
      <ListCard
        displayName={displayName(item)}
        list={item}
        onOpen={handleOpenList}
      />
    ),
    [displayName, handleOpenList]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: t("tabs.lists"),
          ...(Platform.OS === "ios"
            ? {
                headerLargeTitle: true,
                headerLargeTitleStyle: { color: theme.text },
                headerShadowVisible: false,
                headerStyle: { backgroundColor: theme.background },
                headerTransparent: true,
              }
            : {
                headerStyle: { backgroundColor: theme.primary },
                headerTintColor: "#ffffff",
              }),
          headerRight: () => (
            <HeaderMenuButton
              actions={[
                {
                  id: "new",
                  image: Platform.select({
                    android: "ic_input_add",
                    ios: "plus",
                  }),
                  title: t("lists.newList"),
                },
                {
                  id: "settings",
                  image: Platform.select({
                    android: "ic_menu_preferences",
                    ios: "gearshape",
                  }),
                  title: t("settings.title"),
                },
              ]}
              onPressAction={handleMenuAction}
            />
          ),
        }}
      />

      {lists === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior={
            Platform.OS === "ios" ? "automatic" : undefined
          }
          data={lists}
          keyExtractor={keyExtractor}
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={[styles.introTitle, { color: theme.text }]}>
                {t("lists.yourLists")}
              </Text>
              <Text style={[styles.introText, { color: theme.textLight }]}>
                {t("lists.overviewDescription")}
              </Text>
              <TouchableOpacity
                onPress={handleOpenCreate}
                style={[
                  styles.createButton,
                  { backgroundColor: theme.primary },
                ]}
              >
                <Ionicons color="#ffffff" name="add" size={20} />
                <Text style={styles.createButtonText}>
                  {t("lists.newList")}
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={renderList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ListNameModal
        isSaving={isCreating}
        onClose={handleCloseCreate}
        onSave={handleCreate}
        title={t("lists.newList")}
        visible={isCreateOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
    paddingHorizontal: SPACING.md,
  },
  createButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: BORDER_RADIUS.round,
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
  },
  createButtonText: {
    color: "#ffffff",
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  intro: {
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  introText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  introTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  listCard: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: 78,
    padding: SPACING.md,
  },
  listCopy: {
    flex: 1,
  },
  listIcon: {
    alignItems: "center",
    borderRadius: 23,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  listMeta: {
    fontSize: FONT_SIZE.xs,
    marginTop: 4,
  },
  listName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
