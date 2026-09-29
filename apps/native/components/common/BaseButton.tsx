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
  disabled?: boolean;
  hapticFeedback?: boolean;
  loading?: boolean;
  onPress: () => void;
  size?: "small" | "medium" | "large";
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  title: string;
  variant?: "primary" | "secondary" | "outline";
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
            borderColor: theme.primary,
            borderWidth: 1,
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
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
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
    flexDirection: "row",
    justifyContent: "center",
  },
  large: {
    minHeight: 52,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  largeText: {
    fontSize: FONT_SIZE.lg,
  },
  medium: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  mediumText: {
    fontSize: FONT_SIZE.md,
  },
  small: {
    minHeight: 32,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  smallText: {
    fontSize: FONT_SIZE.sm,
  },
  text: {
    fontWeight: "600",
    textAlign: "center",
  },
});

export default BaseButton;
