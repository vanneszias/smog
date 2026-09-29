import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { useMutation } from "convex/react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ListNameModal } from "@/components/lists/ListNameModal";
import { useConvexUserId } from "@/context/ConvexUserSync";
import { useLists } from "@/context/ListsContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";
import logger from "@/utils/logger";

const SHARE_BASE_URL = "https://app.smog.vlaanderen/lists";

export default function ListSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = id as Id<"gesture_lists">;
  const router = useRouter();
  const userId = useConvexUserId();
  const { lists } = useLists();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const { triggerHaptic } = useNativeInteractions();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUpdatingSharing, setIsUpdatingSharing] = useState(false);

  const renameList = useMutation(api.lists.renameList);
  const updateListSharing = useMutation(api.lists.updateListSharing);
  const deleteList = useMutation(api.lists.deleteList);

  const list = useMemo(
    () => lists?.find((candidate) => candidate._id === listId) ?? null,
    [listId, lists]
  );
  const displayName = list?.isDefaultFavorites
    ? t("lists.favorites")
    : (list?.name ?? t("tabs.lists"));

  const handleOpenRename = useCallback(() => {
    setIsRenameOpen(true);
  }, []);

  const handleCloseRename = useCallback(() => {
    setIsRenameOpen(false);
  }, []);

  const handleRename = async (name: string) => {
    if (!(userId && list && !list.isDefaultFavorites)) {
      return;
    }

    setIsSavingName(true);
    try {
      await renameList({ listId: list._id, name: name.trim(), userId });
      triggerHaptic("success");
      showToast(t("lists.listRenamed"));
      setIsRenameOpen(false);
    } catch (error) {
      logger.error("[lists] Failed to rename list:", error);
      triggerHaptic("error");
      showToast(t("lists.saveFailed"));
    } finally {
      setIsSavingName(false);
    }
  };

  const setShared = async (shared: boolean) => {
    if (!(userId && list) || isUpdatingSharing) {
      return null;
    }

    setIsUpdatingSharing(true);
    try {
      const updated = await updateListSharing({
        allowSharedEditing: false,
        listId: list._id,
        userId,
        visibility: shared ? "shared" : "private",
      });
      triggerHaptic("success");
      showToast(shared ? t("lists.listIsShared") : t("lists.listIsPrivate"));
      return updated;
    } catch (error) {
      logger.error("[lists] Failed to update sharing:", error);
      triggerHaptic("error");
      showToast(t("lists.sharingFailed"));
      return null;
    } finally {
      setIsUpdatingSharing(false);
    }
  };

  const handleSharedChange = (value: boolean): void => {
    setShared(value);
  };

  const shareList = async () => {
    if (!list) {
      return;
    }

    const sharedList =
      list.visibility === "shared" && list.viewShareToken
        ? list
        : await setShared(true);
    if (!sharedList?.viewShareToken) {
      return;
    }

    const url = `${SHARE_BASE_URL}/${sharedList.viewShareToken}`;
    try {
      await Share.share({ message: `${displayName}\n${url}`, url });
    } catch (error) {
      logger.error("[lists] Failed to share list:", error);
      showToast(t("lists.shareFailed"));
    }
  };

  const confirmDelete = () => {
    if (!(userId && list && !list.isDefaultFavorites)) {
      return;
    }

    Alert.alert(t("lists.deleteTitle"), t("lists.deleteMessage"), [
      { style: "cancel", text: t("common.cancel") },
      {
        onPress: async () => {
          const deletedListId = list._id;
          router.dismissTo("/lists");

          try {
            await deleteList({ listId: deletedListId, userId });
            triggerHaptic("success");
            showToast(t("lists.listDeleted"));
          } catch (error) {
            logger.error("[lists] Failed to delete list:", error);
            triggerHaptic("error");
            showToast(t("lists.deleteFailed"));
          }
        },
        style: "destructive",
        text: t("common.delete"),
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          title: t("lists.listSettings"),
        }}
      />

      <View
        style={[
          styles.hero,
          { backgroundColor: `${theme.primary}0D`, borderColor: theme.border },
        ]}
      >
        <View
          style={[styles.heroIcon, { backgroundColor: `${theme.primary}16` }]}
        >
          <Ionicons color={theme.primary} name="list" size={25} />
        </View>
        <Text style={[styles.heroTitle, { color: theme.text }]}>
          {displayName}
        </Text>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          disabled={Boolean(list?.isDefaultFavorites)}
          onPress={handleOpenRename}
          style={styles.row}
        >
          <Ionicons color={theme.primary} name="pencil-outline" size={22} />
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              {t("lists.rename")}
            </Text>
            {list?.isDefaultFavorites ? (
              <Text style={[styles.rowDescription, { color: theme.textLight }]}>
                {t("lists.favoritesCannotRename")}
              </Text>
            ) : null}
          </View>
          <Ionicons color={theme.textLight} name="chevron-forward" size={19} />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <View style={styles.row}>
          <Ionicons color={theme.primary} name="globe-outline" size={22} />
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              {t("lists.shared")}
            </Text>
            <Text style={[styles.rowDescription, { color: theme.textLight }]}>
              {t("lists.sharingDescription")}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t("lists.shared")}
            disabled={isUpdatingSharing}
            onValueChange={handleSharedChange}
            trackColor={{ false: theme.border, true: theme.primary }}
            value={list?.visibility === "shared"}
          />
        </View>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <TouchableOpacity onPress={shareList} style={styles.row}>
          <Ionicons color={theme.primary} name="share-outline" size={22} />
          <Text
            style={[styles.rowTitle, styles.rowCopy, { color: theme.text }]}
          >
            {t("lists.share")}
          </Text>
          <Ionicons color={theme.textLight} name="chevron-forward" size={19} />
        </TouchableOpacity>
      </View>

      {list?.isDefaultFavorites ? null : (
        <TouchableOpacity
          onPress={confirmDelete}
          style={[
            styles.deleteButton,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Ionicons color="#c43d3d" name="trash-outline" size={21} />
          <Text style={styles.deleteText}>{t("lists.deleteTitle")}</Text>
        </TouchableOpacity>
      )}

      <ListNameModal
        initialName={list?.name}
        isSaving={isSavingName}
        onClose={handleCloseRename}
        onSave={handleRename}
        title={t("lists.rename")}
        visible={isRenameOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.md,
  },
  deleteButton: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: SPACING.sm,
    justifyContent: "center",
    marginTop: SPACING.lg,
    minHeight: 54,
  },
  deleteText: {
    color: "#c43d3d",
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  hero: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  heroIcon: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroTitle: {
    flex: 1,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: SPACING.md,
    minHeight: 68,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  rowCopy: {
    flex: 1,
  },
  rowDescription: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 17,
    marginTop: 3,
  },
  rowTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  section: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 58,
  },
});
