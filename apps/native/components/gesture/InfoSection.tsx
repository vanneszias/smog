import { Ionicons } from "@expo/vector-icons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

interface InfoSectionProps {
  info: string;
}

const InfoSection: React.FC<InfoSectionProps> = ({ info }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (!info || info.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.infoContainer,
        {
          backgroundColor: `${theme.warning}22`,
          borderLeftColor: theme.warning,
          shadowColor: theme.warning,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Ionicons
          color={theme.warning}
          name="bulb-outline"
          size={ICON_SIZE.md}
        />
        <Text
          style={[
            styles.infoTitle,
            {
              color: theme.warning,
              marginBottom: SPACING.sm,
              fontSize: FONT_SIZE.md,
            },
          ]}
        >
          {t("gesture.infoLabel")}
        </Text>
      </View>
      <Text style={[styles.infoText, { color: theme.text }]}>{info}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  infoContainer: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
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
});

export default InfoSection;
