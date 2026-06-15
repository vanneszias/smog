import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { GestureListRecord } from "@/context/ListsContext";
import { useLists } from "@/context/ListsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

export function ListPickerBottomSheet() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const {
    containingListIds,
    createListAndAddGesture,
    closeListPicker,
    isPickerBusy,
    isPickerLoading,
    lists,
    pendingGesture,
    togglePendingGestureInList,
  } = useLists();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [newListName, setNewListName] = useState("");

  useEffect(() => {
    if (pendingGesture) {
      setNewListName("");
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [pendingGesture]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior={isPickerBusy ? "none" : "close"}
      />
    ),
    [isPickerBusy]
  );

  const renderItem = useCallback(
    ({ item }: { item: GestureListRecord }) => (
      <ListPickerRow
        containsGesture={containingListIds.has(String(item._id))}
        disabled={isPickerBusy || isPickerLoading}
        isLoading={isPickerLoading}
        list={item}
        onPress={togglePendingGestureInList}
      />
    ),
    [
      containingListIds,
      isPickerBusy,
      isPickerLoading,
      togglePendingGestureInList,
    ]
  );

  const header = (
    <View style={styles.header}>
      <View
        style={[styles.heroIcon, { backgroundColor: `${theme.primary}14` }]}
      >
        <Ionicons color={theme.primary} name="list" size={24} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={[styles.title, { color: theme.text }]}>
          {t("lists.addToList")}
        </Text>
        <Text style={[styles.description, { color: theme.textLight }]}>
          {pendingGesture?.gestureName
            ? t("lists.chooseListFor", { name: pendingGesture.gestureName })
            : t("lists.chooseList")}
        </Text>
      </View>
    </View>
  );

  const footer = (
    <View style={[styles.createSection, { borderTopColor: theme.border }]}>
      <Text style={[styles.createLabel, { color: theme.text }]}>
        {t("lists.createNew")}
      </Text>
      <View style={styles.createRow}>
        <BottomSheetTextInput
          autoCapitalize="sentences"
          editable={!isPickerBusy}
          maxLength={80}
          onChangeText={setNewListName}
          onSubmitEditing={() => createListAndAddGesture(newListName)}
          placeholder={t("lists.newListPlaceholder")}
          placeholderTextColor={theme.textLight}
          returnKeyType="done"
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={newListName}
        />
        <TouchableOpacity
          accessibilityLabel={t("lists.createAndAdd")}
          disabled={!newListName.trim() || isPickerBusy}
          onPress={() => createListAndAddGesture(newListName)}
          style={[
            styles.createButton,
            { backgroundColor: theme.primary },
            !newListName.trim() || isPickerBusy ? styles.disabled : null,
          ]}
        >
          {isPickerBusy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Ionicons color="#ffffff" name="arrow-forward" size={21} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <BottomSheetModal
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.background }}
      enableDismissOnClose={!isPickerBusy}
      enableDynamicSizing={false}
      index={0}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onDismiss={closeListPicker}
      ref={bottomSheetRef}
      snapPoints={["72%", "92%"]}
    >
      <BottomSheetFlatList
        contentContainerStyle={styles.content}
        data={lists ?? []}
        keyExtractor={(item: GestureListRecord) => item._id}
        ListEmptyComponent={
          lists === undefined ? (
            <ActivityIndicator
              color={theme.primary}
              size="small"
              style={styles.loading}
            />
          ) : null
        }
        ListFooterComponent={footer}
        ListHeaderComponent={header}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheetModal>
  );
}

function ListPickerRow({
  containsGesture,
  disabled,
  isLoading,
  list,
  onPress,
}: {
  containsGesture: boolean;
  disabled: boolean;
  isLoading: boolean;
  list: GestureListRecord;
  onPress: (list: GestureListRecord) => void;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const status = containsGesture
    ? t("lists.inThisList")
    : list.visibility === "shared"
      ? t("lists.shared")
      : t("lists.private");

  return (
    <TouchableOpacity
      accessibilityHint={
        containsGesture
          ? t("lists.tapToRemoveFromList")
          : t("lists.tapToAddToList")
      }
      accessibilityRole="button"
      activeOpacity={0.72}
      disabled={disabled}
      onPress={() => onPress(list)}
      style={[
        styles.listRow,
        {
          backgroundColor: theme.card,
          borderColor: containsGesture ? theme.primary : theme.border,
        },
      ]}
    >
      <View
        style={[
          styles.listIcon,
          {
            backgroundColor: containsGesture
              ? theme.primary
              : `${theme.primary}14`,
          },
        ]}
      >
        <Ionicons
          color={containsGesture ? "#ffffff" : theme.primary}
          name={containsGesture ? "checkmark" : "list-outline"}
          size={20}
        />
      </View>
      <View style={styles.listCopy}>
        <Text
          numberOfLines={1}
          style={[styles.listName, { color: theme.text }]}
        >
          {list.isDefaultFavorites ? t("lists.favorites") : list.name}
        </Text>
        <Text style={[styles.listStatus, { color: theme.textLight }]}>
          {status}
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={theme.primary} size="small" />
      ) : (
        <Ionicons
          color={containsGesture ? theme.primary : theme.textLight}
          name={containsGesture ? "remove-circle-outline" : "add-circle"}
          size={26}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  heroIcon: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.4,
  },
  description: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 19,
    marginTop: 3,
  },
  listRow: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  listIcon: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  listCopy: {
    flex: 1,
  },
  listName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  listStatus: {
    fontSize: FONT_SIZE.xs,
    marginTop: 3,
  },
  loading: {
    paddingVertical: SPACING.lg,
  },
  createSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.sm,
    paddingTop: SPACING.lg,
  },
  createLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  createRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  input: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    fontSize: FONT_SIZE.md,
    height: 50,
    paddingHorizontal: SPACING.md,
  },
  createButton: {
    alignItems: "center",
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  disabled: {
    opacity: 0.42,
  },
});
