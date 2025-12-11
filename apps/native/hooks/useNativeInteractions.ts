import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { Platform } from "react-native";

export const useNativeInteractions = () => {
  const triggerHaptic = useCallback(
    (type: "light" | "medium" | "heavy" | "success" | "error" = "light") => {
      if (Platform.OS === "ios") {
        switch (type) {
          case "light":
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            break;
          case "medium":
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
          case "heavy":
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            break;
          case "success":
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
          case "error":
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
        }
      }
    },
    []
  );

  const triggerSelection = useCallback(() => {
    if (Platform.OS === "ios") {
      Haptics.selectionAsync();
    }
  }, []);

  return {
    triggerHaptic,
    triggerSelection,
  };
};
