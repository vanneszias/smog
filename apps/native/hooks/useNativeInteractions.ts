import {
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
  selectionAsync,
} from "expo-haptics";
import { useCallback } from "react";
import { Platform } from "react-native";

export const useNativeInteractions = () => {
  const triggerHaptic = useCallback(
    (type: "light" | "medium" | "heavy" | "success" | "error" = "light") => {
      if (Platform.OS === "ios") {
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
          default:
            // Handle default case
            break;
        }
      }
    },
    []
  );

  const triggerSelection = useCallback(() => {
    if (Platform.OS === "ios") {
      selectionAsync();
    }
  }, []);

  return {
    triggerHaptic,
    triggerSelection,
  };
};
