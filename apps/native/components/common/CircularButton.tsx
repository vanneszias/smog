import Ionicons from "@expo/vector-icons/Ionicons";
import {
  FONT_SIZE,
  FONT_WEIGHT,
  HIT_SLOP,
  ICON_SIZE,
  SHADOWS,
} from "@smog/styles";
import type React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";

interface CircularButtonProps {
  accessibilityLabel: string;
  backgroundColor?: string;
  /** When > 0, renders a small count badge in the top-right corner */
  badgeCount?: number;
  disabled?: boolean;
  hapticFeedback?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress: () => void;
  size?: "small" | "medium" | "large";
  style?: ViewStyle;
}

const CircularButton: React.FC<CircularButtonProps> = ({
  accessibilityLabel,
  icon,
  onPress,
  size = "medium",
  backgroundColor,
  iconColor,
  style,
  disabled = false,
  hapticFeedback = true,
  badgeCount = 0,
}) => {
  const { theme } = useTheme();
  const { triggerHaptic } = useNativeInteractions();

  const getSizeStyles = () => {
    switch (size) {
      case "small":
        return { borderRadius: 16, height: 32, width: 32 };
      case "large":
        return { borderRadius: 28, height: 56, width: 56 };
      default:
        return { borderRadius: 22, height: 44, width: 44 };
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

  const showBadge = badgeCount > 0;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
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
          disabled ? styles.disabled : null,
        ]}
      >
        <Ionicons
          color={iconColor || theme.background}
          name={icon}
          size={getIconSize()}
        />
      </TouchableOpacity>

      {showBadge && (
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <Text style={styles.badgeText}>
            {badgeCount > 9 ? "9+" : String(badgeCount)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    borderColor: "#ffffff",
    borderRadius: 9,
    // white border to separate badge from button
    borderWidth: 1.5,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 3,
    position: "absolute",
    right: -4,
    top: -4,
  },
  badgeText: {
    color: "#ffffff",
    fontFamily: "Onest-Bold",
    fontSize: FONT_SIZE.xs - 1,
    fontWeight: FONT_WEIGHT.bold,
    includeFontPadding: false,
    lineHeight: 13,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.6,
  },
  wrapper: {
    position: "relative",
  },
});

export default CircularButton;
