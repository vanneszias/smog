import Ionicons from "@expo/vector-icons/Ionicons";
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
              fontSize: FONT_SIZE.md,
              marginBottom: SPACING.sm,
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
  infoText: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md * 1.4,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginLeft: SPACING.sm,
  },
});

export default InfoSection;
