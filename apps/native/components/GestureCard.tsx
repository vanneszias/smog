import Ionicons from "@expo/vector-icons/Ionicons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import { memo, useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import type { Gesture } from "@/types";
import { typography } from "@/utils/typography";

interface GestureCardProps {
  gesture: Gesture;
  isSaved?: boolean;
  onOpenListPicker?: (gesture: Gesture) => void;
  onPress: (gesture: Gesture) => void;
}

const GestureCard = ({
  gesture,
  onPress,
  isSaved = false,
  onOpenListPicker,
}: GestureCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    onPress(gesture);
  }, [onPress, gesture]);

  const handleOpenListPicker = useCallback(() => {
    onOpenListPicker?.(gesture);
  }, [onOpenListPicker, gesture]);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        accessibilityHint={gesture.category.join(", ")}
        accessibilityLabel={gesture.name}
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={handlePress}
      >
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
              {/* biome-ignore lint/suspicious/noUnnecessaryConditions: gesture comes from an untyped Convex query cast; concept may be missing at runtime */}
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
              accessibilityRole="button"
              activeOpacity={0.8}
              hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
              onPress={handleOpenListPicker}
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
  cardContent: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
  },
  container: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
    padding: SPACING.md,
  },
  listButton: {
    marginLeft: SPACING.sm,
    padding: SPACING.sm,
  },
  textContainer: {
    display: "flex",
    flexDirection: "column",
    gap: SPACING.xs,
  },
  wrapper: {
    marginVertical: SPACING.xs,
    position: "relative",
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
