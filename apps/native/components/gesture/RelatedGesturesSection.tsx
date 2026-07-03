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

const RelatedGesturesSection: React.FC<RelatedGesturesSectionProps> = ({
  relatedGestures,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

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
                marginBottom: SPACING.sm,
                fontSize: FONT_SIZE.md,
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
                <TouchableOpacity
                  key={gesture.id}
                  onPress={() => router.push(`/gestures/${gesture.id}`)}
                  style={[
                    styles.relatedBadge,
                    { backgroundColor: `${theme.primary}22` },
                  ]}
                >
                  <Text
                    style={[styles.relatedBadgeText, { color: theme.primary }]}
                  >
                    {gesture.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: -SPACING.md,
    marginBottom: SPACING.xl,
  },
  infoContainer: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
  },
  relatedContainer: {
    ...SHADOWS.small,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginLeft: SPACING.sm,
  },
  infoText: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md * 1.4,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  badgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  relatedBadge: {
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    alignSelf: "flex-start",
  },
  relatedBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
});

export default RelatedGesturesSection;
