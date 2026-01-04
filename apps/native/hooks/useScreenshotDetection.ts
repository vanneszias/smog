import { addScreenshotListener } from "expo-screen-capture";
import { useEffect } from "react";
import { Alert, Platform, Share } from "react-native";
import { useTranslation } from "@/context/TranslationContext";

type UseScreenshotDetectionOptions = {
  gestureId: string | null;
  gestureName: string | null;
  enabled?: boolean;
};

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
      const gestureUrl = `https://smog.zias.be/gestures/${gestureId}`;

      Alert.alert(
        t("screenshot.sharePrompt.title"),
        t("screenshot.sharePrompt.message", { name: gestureName }),
        [
          {
            text: t("screenshot.sharePrompt.cancel"),
            style: "cancel",
          },
          {
            text: t("screenshot.sharePrompt.share"),
            onPress: async () => {
              try {
                await Share.share({
                  message:
                    Platform.OS === "android"
                      ? `${t("screenshot.sharePrompt.shareMessage", { name: gestureName })}\n${gestureUrl}`
                      : t("screenshot.sharePrompt.shareMessage", {
                          name: gestureName,
                        }),
                  url: Platform.OS === "ios" ? gestureUrl : undefined,
                  title: t("screenshot.sharePrompt.shareTitle", {
                    name: gestureName,
                  }),
                });
              } catch (error) {
                console.error("Error sharing:", error);
              }
            },
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
