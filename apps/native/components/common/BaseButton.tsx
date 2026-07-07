import { BORDER_RADIUS, FONT_SIZE, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableOpacity,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";

interface BaseButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline";
  size?: "small" | "medium" | "large";
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  hapticFeedback?: boolean;
}

const BaseButton: React.FC<BaseButtonProps> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  size = "medium",
  style,
  textStyle,
  hapticFeedback = true,
}) => {
  const { theme } = useTheme();
  const { triggerHaptic } = useNativeInteractions();

  const getButtonStyle = () => {
    const baseStyle = [
      styles.button,
      styles[size],
      { borderRadius: BORDER_RADIUS.md },
      SHADOWS.small,
    ];

    switch (variant) {
      case "primary":
        return [...baseStyle, { backgroundColor: theme.primary }, style];
      case "secondary":
        return [...baseStyle, { backgroundColor: theme.secondary }, style];
      case "outline":
        return [
          ...baseStyle,
          {
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: theme.primary,
          },
          style,
        ];
      default:
        return [...baseStyle, style];
    }
  };

  const getTextStyle = () => {
    const baseTextStyle = [styles.text, styles[`${size}Text`]];

    switch (variant) {
      case "outline":
        return [...baseTextStyle, { color: theme.primary }, textStyle];
      default:
        return [...baseTextStyle, { color: theme.background }, textStyle];
    }
  };

  const handlePress = () => {
    if (hapticFeedback && !disabled && !loading) {
      triggerHaptic("medium");
    }
    onPress();
  };

  return (
    <TouchableOpacity
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={handlePress}
      style={getButtonStyle()}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "outline" ? theme.primary : theme.background}
          size="small"
        />
      ) : (
        <Text style={getTextStyle()}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  small: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minHeight: 32,
  },
  medium: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  large: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 52,
  },
  text: {
    fontWeight: "600",
    textAlign: "center",
  },
  smallText: {
    fontSize: FONT_SIZE.sm,
  },
  mediumText: {
    fontSize: FONT_SIZE.md,
  },
  largeText: {
    fontSize: FONT_SIZE.lg,
  },
});

export default BaseButton;
