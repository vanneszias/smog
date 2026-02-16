import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from "expo-haptics";
import { useCallback } from "react";
import { Platform } from "react-native";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";

export const useNativeInteractions = () => {
  const triggerHaptic = useCallback((type: HapticType = "light") => {
    if (Platform.OS === "android") {
      // Use Android-specific haptic primitives for richer feedback
      switch (type) {
        case "light":
          performAndroidHapticsAsync(AndroidHaptics.Clock_Tick);
          break;
        case "medium":
          impactAsync(ImpactFeedbackStyle.Medium);
          break;
        case "heavy":
          impactAsync(ImpactFeedbackStyle.Heavy);
          break;
        case "success":
          performAndroidHapticsAsync(AndroidHaptics.Confirm);
          break;
        case "error":
          performAndroidHapticsAsync(AndroidHaptics.Reject);
          break;
      }
    } else {
      // iOS — use standard UIKit haptic patterns
      switch (type) {
        case "light":
          impactAsync(ImpactFeedbackStyle.Light);
          break;
        case "medium":
          impactAsync(ImpactFeedbackStyle.Medium);
          break;
        case "heavy":
          impactAsync(ImpactFeedbackStyle.Heavy);
          break;
        case "success":
          notificationAsync(NotificationFeedbackType.Success);
          break;
        case "error":
          notificationAsync(NotificationFeedbackType.Error);
          break;
      }
    }
  }, []);

  const triggerSelection = useCallback(() => {
    selectionAsync();
  }, []);

  const triggerToggle = useCallback((on: boolean) => {
    if (Platform.OS === "android") {
      performAndroidHapticsAsync(
        on ? AndroidHaptics.Toggle_On : AndroidHaptics.Toggle_Off
      );
    } else {
      impactAsync(ImpactFeedbackStyle.Light);
    }
  }, []);

  return {
    triggerHaptic,
    triggerSelection,
    triggerToggle,
  };
};
