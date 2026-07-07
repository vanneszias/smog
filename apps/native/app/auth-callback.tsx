import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/context/AuthProvider";
import logger from "@/utils/logger";

export default function AuthCallback() {
  const router = useRouter();
  const { authMode, isHandlingOAuthCallback, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isHandlingOAuthCallback) {
      return;
    }

    try {
      if (authMode === "authenticated" || authMode === "guest") {
        logger.log("[AuthCallback] Auth settled, navigating to tabs");
        router.replace("/(tabs)");
        return;
      }

      if (authMode === "unauthenticated") {
        logger.log(
          "[AuthCallback] Auth failed or cancelled, returning to welcome"
        );
        router.replace("/welcome");
      }
    } catch (error) {
      logger.error("[AuthCallback] Error handling auth callback:", error);
      router.replace("/welcome");
    }
  }, [authMode, isHandlingOAuthCallback, isLoading, router]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#007AFF",
      }}
    >
      <Text style={{ color: "white", fontSize: 18 }}>
        Completing sign in...
      </Text>
    </View>
  );
}
