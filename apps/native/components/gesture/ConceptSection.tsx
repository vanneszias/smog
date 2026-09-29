import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

interface ConceptSectionProps {
  concepts: string[];
}

const ConceptSection: React.FC<ConceptSectionProps> = ({ concepts }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (!concepts || concepts.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.infoContainer,
        styles.conceptContainer,
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
          name="pricetags-outline"
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
          {t("gesture.conceptsLabel")}
        </Text>
      </View>
      <Text style={[styles.conceptText, { color: theme.textLight }]}>
        {concepts.join(", ")}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  conceptContainer: {
    ...SHADOWS.small,
  },
  conceptText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: FONT_SIZE.sm * 1.4,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: SPACING.sm,
  },
  infoContainer: {
    borderLeftWidth: 4,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginLeft: SPACING.sm,
  },
});

export default ConceptSection;
