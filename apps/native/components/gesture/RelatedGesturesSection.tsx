import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import { useRouter } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import type { Gesture } from "@/types";

interface RelatedGesturesSectionProps {
  relatedGestures: Gesture[];
}

interface RelatedGestureBadgeProps {
  gesture: Gesture;
  onSelect: (gestureId: string) => void;
}

const RelatedGestureBadge = ({
  gesture,
  onSelect,
}: RelatedGestureBadgeProps) => {
  const { theme } = useTheme();

  const handlePress = useCallback(() => {
    onSelect(gesture.id);
  }, [onSelect, gesture.id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.relatedBadge, { backgroundColor: `${theme.primary}22` }]}
    >
      <Text style={[styles.relatedBadgeText, { color: theme.primary }]}>
        {gesture.name}
      </Text>
    </TouchableOpacity>
  );
};

const RelatedGesturesSection: React.FC<RelatedGesturesSectionProps> = ({
  relatedGestures,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handleSelectGesture = useCallback(
    (gestureId: string): void => {
      router.push(`/gestures/${gestureId}`);
    },
    [router]
  );

  return (
    <View style={styles.outerContainer}>
      <View
        style={[
          styles.infoContainer,
          styles.relatedContainer,
          {
            backgroundColor: theme.background,
            borderLeftColor: theme.primary,
            shadowColor: theme.primary,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Ionicons
            color={theme.primary}
            name="people-outline"
            size={ICON_SIZE.md}
          />
          <Text
            style={[
              styles.infoTitle,
              {
                color: theme.primary,
                fontSize: FONT_SIZE.md,
                marginBottom: SPACING.sm,
              },
            ]}
          >
            {t("gesture.relatedLabel")}
          </Text>
        </View>
        {relatedGestures.length === 0 ? (
          <Text style={[styles.infoText, { color: theme.text }]}>
            {t("gesture.relatedDescription")}
          </Text>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <View style={styles.badgeContainer}>
              {relatedGestures.map((gesture) => (
                <RelatedGestureBadge
                  gesture={gesture}
                  key={gesture.id}
                  onSelect={handleSelectGesture}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: SPACING.sm,
  },
  infoContainer: {
    borderLeftWidth: 4,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md * 1.4,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginLeft: SPACING.sm,
  },
  outerContainer: {
    marginBottom: SPACING.xl,
    marginHorizontal: -SPACING.md,
  },
  relatedBadge: {
    alignSelf: "flex-start",
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  relatedBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  relatedContainer: {
    ...SHADOWS.small,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
});

export default RelatedGesturesSection;
