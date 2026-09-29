import { addScreenshotListener } from "expo-screen-capture";
import { useEffect } from "react";
import { Alert, Platform, Share } from "react-native";
import { useTranslation } from "@/context/TranslationContext";
import logger from "@/utils/logger";

interface UseScreenshotDetectionOptions {
  enabled?: boolean;
  gestureId: string | null;
  gestureName: string | null;
}

export const useScreenshotDetection = ({
  gestureId,
  gestureName,
  enabled = true,
}: UseScreenshotDetectionOptions) => {
  const { t } = useTranslation();

  useEffect(() => {
    const isEnabled = enabled && gestureId && gestureName;
    if (!isEnabled) {
      return;
    }

    const subscription = addScreenshotListener(() => {
      const gestureUrl = `https://app.smog.vlaanderen/gestures/${gestureId}`;

      Alert.alert(
        t("screenshot.sharePrompt.title"),
        t("screenshot.sharePrompt.message", { name: gestureName }),
        [
          {
            style: "cancel",
            text: t("screenshot.sharePrompt.cancel"),
          },
          {
            onPress: async () => {
              try {
                await Share.share({
                  message:
                    Platform.OS === "android"
                      ? `${t("screenshot.sharePrompt.shareMessage", { name: gestureName })}\n${gestureUrl}`
                      : t("screenshot.sharePrompt.shareMessage", {
                          name: gestureName,
                        }),
                  title: t("screenshot.sharePrompt.shareTitle", {
                    name: gestureName,
                  }),
                  url: Platform.OS === "ios" ? gestureUrl : undefined,
                });
              } catch (error) {
                logger.error("Error sharing:", error);
              }
            },
            text: t("screenshot.sharePrompt.share"),
          },
        ],
        { cancelable: true }
      );
    });

    return () => {
      subscription.remove();
    };
  }, [gestureId, gestureName, enabled, t]);
};
