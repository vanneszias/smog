import { Ionicons } from "@expo/vector-icons";
import {
  ANIMATION_DURATION,
  BORDER_RADIUS,
  FONT_SIZE,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";

const useGlass = isLiquidGlassAvailable();

import { useToast } from "@/context/ToastContext";
import {
  trackToastActionPressed,
  trackToastShown,
} from "@/services/analyticsService";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  action?: ToastAction;
  type?: "info" | "success" | "warning" | "error";
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  onHide,
  action,
  type = "info",
}) => {
  const { theme } = useTheme();
  const { registerHideCallback } = useToast();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(100)).current;
  const isHidingRef = useRef(false);

  const handleHide = useCallback(() => {
    // Prevent multiple hide calls
    if (isHidingRef.current) {
      return;
    }
    isHidingRef.current = true;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION.fast,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 100,
        duration: ANIMATION_DURATION.fast,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isHidingRef.current = false;
      onHide();
    });
  }, [fadeAnim, translateYAnim, onHide]);

  // Register this component's handleHide with the context for auto-dismissal
  useEffect(() => {
    registerHideCallback(handleHide);
  }, [registerHideCallback, handleHide]);

  useEffect(() => {
    if (visible) {
      // Reset hiding flag when showing
      isHidingRef.current = false;

      // Track toast shown
      trackToastShown(message, type, !!action);

      // Show animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION.normal,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION.normal,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // If visible becomes false, reset animations
      fadeAnim.setValue(0);
      translateYAnim.setValue(100);
      isHidingRef.current = false;
    }
  }, [visible, fadeAnim, translateYAnim, message, type, action]);

  const getToastColor = () => {
    switch (type) {
      case "success":
        return theme.primary; // Use primary color for success
      case "warning":
        return theme.warning;
      case "error":
        return theme.error;
      default:
        return theme.primary;
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "warning":
        return "warning";
      case "error":
        return "close-circle";
      default:
        return "information-circle";
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <TouchableWithoutFeedback onPress={handleHide}>
      <View
        style={[styles.container, { paddingBottom: SPACING.md + bottomInset }]}
      >
        <Animated.View
          style={[
            styles.toast,
            {
              backgroundColor: useGlass ? "transparent" : theme.card,
              borderColor: useGlass ? "transparent" : theme.border,
              borderWidth: useGlass ? 0 : 1,
              opacity: fadeAnim,
              transform: [{ translateY: translateYAnim }],
              overflow: "hidden",
            },
            !useGlass && SHADOWS.medium,
          ]}
        >
          {useGlass && (
            <GlassView
              glassEffectStyle="regular"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons
                color={getToastColor()}
                name={getIcon() as keyof typeof Ionicons.glyphMap}
                size={20}
                style={styles.icon}
              />
            </View>
            <View style={styles.messageContainer}>
              <Text
                numberOfLines={2}
                style={[styles.message, { color: theme.text }]}
              >
                {message}
              </Text>
            </View>
            {action ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  trackToastActionPressed(action.label);
                  action.onPress();
                  handleHide();
                }}
                style={[styles.actionButton, { borderColor: getToastColor() }]}
              >
                <Text style={[styles.actionText, { color: getToastColor() }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.md,
    pointerEvents: "box-none",
  },
  toast: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    width: "100%",
    maxWidth: 500,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    minHeight: 56,
  },
  iconContainer: {
    marginRight: SPACING.sm,
  },
  icon: {
    opacity: 0.8,
  },
  messageContainer: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  message: {
    fontSize: FONT_SIZE.md,
    lineHeight: 20,
  },
  actionButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    minWidth: 60,
    alignItems: "center",
  },
  actionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "600",
  },
});

export default Toast;
