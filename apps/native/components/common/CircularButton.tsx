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
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: "small" | "medium" | "large";
  backgroundColor?: string;
  iconColor?: string;
  style?: ViewStyle;
  disabled?: boolean;
  hapticFeedback?: boolean;
  /** When > 0, renders a small count badge in the top-right corner */
  badgeCount?: number;
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
  wrapper: {
    position: "relative",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.6,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    // white border to separate badge from button
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  badgeText: {
    fontSize: FONT_SIZE.xs - 1,
    fontWeight: FONT_WEIGHT.bold,
    fontFamily: "Onest-Bold",
    color: "#ffffff",
    lineHeight: 13,
    includeFontPadding: false,
  },
});

export default CircularButton;
