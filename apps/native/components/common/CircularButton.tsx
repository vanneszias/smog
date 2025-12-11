import { Ionicons } from "@expo/vector-icons";
import { HIT_SLOP, ICON_SIZE, SHADOWS } from "@smog/styles";
import type React from "react";
import { StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";

type CircularButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: "small" | "medium" | "large";
  backgroundColor?: string;
  iconColor?: string;
  style?: ViewStyle;
  disabled?: boolean;
  hapticFeedback?: boolean;
};

const CircularButton: React.FC<CircularButtonProps> = ({
  icon,
  onPress,
  size = "medium",
  backgroundColor,
  iconColor,
  style,
  disabled = false,
  hapticFeedback = true,
}) => {
  const { theme } = useTheme();
  const { triggerHaptic } = useNativeInteractions();

  const getSizeStyles = () => {
    switch (size) {
      case "small":
        return { width: 32, height: 32, borderRadius: 16 };
      case "large":
        return { width: 56, height: 56, borderRadius: 28 };
      default:
        return { width: 44, height: 44, borderRadius: 22 };
    }
  };

  const getIconSize = () => {
    switch (size) {
      case "small":
        return ICON_SIZE.sm;
      case "large":
        return ICON_SIZE.lg;
      default:
        return ICON_SIZE.md;
    }
  };

  const handlePress = () => {
    if (hapticFeedback) {
      triggerHaptic("light");
    }
    onPress();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      hitSlop={HIT_SLOP.md}
      onPress={handlePress}
      style={[
        styles.button,
        getSizeStyles(),
        {
          backgroundColor: backgroundColor || theme.primary,
        },
        SHADOWS.medium,
        style,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons
        color={iconColor || theme.background}
        name={icon}
        size={getIconSize()}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.6,
  },
});

export default CircularButton;
