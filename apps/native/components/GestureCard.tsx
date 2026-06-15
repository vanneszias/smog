import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import type { Gesture } from "@/types";
import { typography } from "@/utils/typography";

interface GestureCardProps {
  gesture: Gesture;
  onPress: (gesture: Gesture) => void;
  isSaved?: boolean;
  onOpenListPicker?: (gesture: Gesture) => void;
}

const GestureCard = ({
  gesture,
  onPress,
  isSaved = false,
  onOpenListPicker,
}: GestureCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(gesture)}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
            SHADOWS.medium,
          ]}
        >
          <View style={styles.cardContent}>
            <View style={styles.textContainer}>
              <Text
                style={[
                  typography.subtitle,
                  { color: theme.text, marginBottom: 0 },
                ]}
              >
                {gesture.name}
              </Text>
              <Text style={[typography.bodySmall, { color: theme.textLight }]}>
                {gesture.category.join(", ")}
              </Text>
              {gesture.concept?.length ? (
                <Text style={[typography.caption, { color: theme.textLight }]}>
                  {gesture.concept.join(", ")}
                </Text>
              ) : null}
              {gesture.info ? (
                <Text style={[typography.caption, { color: theme.textLight }]}>
                  {gesture.info}
                </Text>
              ) : null}
            </View>
          </View>

          {onOpenListPicker ? (
            <TouchableOpacity
              accessibilityLabel={
                isSaved ? t("lists.manageGestureLists") : t("lists.addToList")
              }
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => onOpenListPicker(gesture)}
              style={styles.listButton}
            >
              <Ionicons
                color={theme.primary}
                name={isSaved ? "checkmark-circle" : "list-outline"}
                size={ICON_SIZE.md}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: SPACING.xs,
    position: "relative",
  },
  container: {
    flexDirection: "row",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  textContainer: {
    display: "flex",
    flexDirection: "column",
    gap: SPACING.xs,
  },
  listButton: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  },
});

/**
 * Memoised export — prevents unnecessary re-renders when the parent
 * (e.g. a FlatList) re-renders but the gesture data and callbacks haven't changed.
 *
 * The comparison is shallow by default. Because `gesture` is an object, the
 * parent should avoid creating new gesture references on each render (use
 * `useMemo` or stable references from the gesture service).
 */
export default memo(GestureCard);
