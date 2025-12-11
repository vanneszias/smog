import { BORDER_RADIUS, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { typography } from "@/utils/typography";

type BaseCardProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
  contentStyle?: ViewStyle;
  shadow?: "small" | "medium" | "large" | "none";
};

const BaseCard: React.FC<BaseCardProps> = ({
  children,
  title,
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
  contentStyle,
  shadow = "medium",
}) => {
  const { theme } = useTheme();

  const getShadowStyle = () => {
    switch (shadow) {
      case "small":
        return SHADOWS.small;
      case "large":
        return SHADOWS.large;
      case "none":
        return {};
      default:
        return SHADOWS.medium;
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        getShadowStyle(),
        style,
      ]}
    >
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && (
            <Text style={[typography.title, { color: theme.text }, titleStyle]}>
              {title}
            </Text>
          )}
          {subtitle && (
            <Text
              style={[
                typography.bodySmall,
                { color: theme.textLight },
                subtitleStyle,
              ]}
            >
              {subtitle}
            </Text>
          )}
        </View>
      )}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  content: {
    padding: SPACING.md,
    paddingTop: 0,
  },
});

export default BaseCard;
