import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    // Wait for WorkOS to finish loading
    if (isLoading) {
      return;
    }

    const handleAuthCallback = async () => {
      try {
        console.log("[AuthCallback] Starting auth callback process");
        console.log("[AuthCallback] Current user:", !!user);

        // Clear any existing guest mode since user just authenticated
        if (user) {
          console.log("[AuthCallback] Clearing guest mode");
          await AsyncStorage.removeItem("@smog_guest_mode");
          await AsyncStorage.removeItem("@smog_guest_id");
        }

        // Wait a bit for auth state to stabilize
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (user) {
          console.log("[AuthCallback] User is signed in, navigating to tabs");
          router.replace("/(tabs)");
        } else {
          console.log(
            "[AuthCallback] User not signed in, returning to welcome"
          );
          router.replace("/welcome");
        }
      } catch (error) {
        console.error("[AuthCallback] Error handling auth callback:", error);
        router.replace("/welcome");
      } finally {
        setIsProcessing(false);
      }
    };

    if (isProcessing) {
      handleAuthCallback();
    }
  }, [router, isLoading, user, isProcessing]);

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
