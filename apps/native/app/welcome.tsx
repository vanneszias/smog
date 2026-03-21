import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@smog/convex";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import GDPRConsentModal from "@/components/GDPRConsentModal";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useDbReady } from "@/hooks/useDbReady";
import logger from "@/utils/logger";

const { height: screenHeight } = Dimensions.get("window");
const isSmallScreen = screenHeight < 700;

export default function WelcomeScreen() {
  const { continueAsGuest, signIn, user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { isReady: dbReady } = useDbReady();

  const [showConsent, setShowConsent] = useState(false);
  const [hasCheckedConsent, setHasCheckedConsent] = useState(false);
  const [pendingAction, setPendingAction] = useState<"guest" | "signin" | null>(
    null
  );
  const [pendingNavigation, setPendingNavigation] = useState(false);

  const recordGuestConsent = useMutation(api.gdpr.recordGuestConsent);

  useEffect(() => {
    if (pendingNavigation && dbReady) {
      router.replace("/(tabs)");
      setPendingNavigation(false);
    }
  }, [dbReady, pendingNavigation, router]);

  useEffect(() => {
    const checkConsentStatus = async () => {
      const consent = await AsyncStorage.getItem("@smog_gdpr_consent");
      setHasCheckedConsent(true);
      if (!consent) {
        // Will show consent on first action
        return;
      }
    };

    checkConsentStatus();
  }, []);

  const handleSignInSignUp = async () => {
    try {
      const consent = await AsyncStorage.getItem("@smog_gdpr_consent");
      if (!consent) {
        setPendingAction("signin");
        setShowConsent(true);
        return;
      }

      logger.log("[Welcome] Starting WorkOS sign-in");
      signIn();
    } catch (error) {
      logger.error("[Welcome] Sign-in error:", error);
      Alert.alert(t("common.error"), "Failed to sign in. Please try again.");
    }
  };

  const handleGuestAccess = async () => {
    const consent = await AsyncStorage.getItem("@smog_gdpr_consent");
    if (!consent) {
      setPendingAction("guest");
      setShowConsent(true);
      return;
    }

    await continueAsGuest?.();
    if (dbReady) {
      router.replace("/(tabs)");
    } else {
      setPendingNavigation(true);
    }
  };

  const handleAcceptAll = async (analyticsConsent: boolean) => {
    try {
      await AsyncStorage.setItem("@smog_gdpr_consent", "accepted");
      await AsyncStorage.setItem(
        "@smog_analytics_consent",
        analyticsConsent.toString()
      );
      await AsyncStorage.setItem("@smog_consent_version", "1.0");
      await AsyncStorage.setItem(
        "@smog_consent_date",
        new Date().toISOString()
      );

      setShowConsent(false);

      // Execute pending action
      if (pendingAction === "guest") {
        // Generate guest ID if not exists
        let guestId = await AsyncStorage.getItem("@smog_guest_id");
        if (!guestId) {
          const { randomUUID } = await import("expo-crypto");
          guestId = `guest_${randomUUID().replace(/-/g, "")}`;
          await AsyncStorage.setItem("@smog_guest_id", guestId);
        }

        // Record consent in backend
        await recordGuestConsent({ guestId, analyticsConsent });

        await continueAsGuest?.();
        router.replace("/(tabs)");
      } else if (pendingAction === "signin") {
        signIn();
      }

      setPendingAction(null);
    } catch (error) {
      logger.error("[Welcome] Failed to save consent:", error);
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    }
  };

  const handleAcceptRequired = async () => {
    await handleAcceptAll(false);
  };

  // If user is already signed in, redirect them
  if (user) {
    router.replace("/(tabs)");
    return null;
  }

  if (!hasCheckedConsent) {
    return null; // Loading state
  }

  // Show loading while database is being prepared for navigation
  if (pendingNavigation) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.primary }]}
      >
        <View style={styles.centerContainer}>
          <ActivityIndicator color={theme.background} size="large" />
          <Text style={[styles.loadingText, { color: theme.background }]}>
            {t("common.loading") || "Loading..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.primary }]}
    >
      <View
        style={[styles.content, isSmallScreen ? styles.contentSmall : null]}
      >
        <View style={[styles.logoContainer]}>
          <Logo
            height={isSmallScreen ? 60 : 80}
            variant="theme"
            width={isSmallScreen ? 180 : 240}
          />
        </View>

        <View
          style={[
            styles.buttonContainer,
            isSmallScreen ? styles.buttonContainerSmall : null,
          ]}
        >
          <TouchableOpacity
            onPress={handleGuestAccess}
            style={[
              styles.guestButton,
              isSmallScreen ? styles.buttonSmall : null,
            ]}
          >
            <Text
              style={[
                styles.guestButtonText,
                { color: theme.background },
                isSmallScreen ? styles.buttonTextSmall : null,
              ]}
            >
              {t("auth.continueAsGuest")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSignInSignUp}
            style={[
              styles.primaryButton,
              { backgroundColor: theme.background },
              isSmallScreen ? styles.buttonSmall : null,
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: theme.primary },
                isSmallScreen ? styles.buttonTextSmall : null,
              ]}
            >
              {t("auth.welcome.signInSignUp")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <GDPRConsentModal
        onAcceptAll={handleAcceptAll}
        onAcceptRequired={handleAcceptRequired}
        visible={showConsent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  contentSmall: {
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  logoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 220,
    height: 150,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    textAlign: "center",
    opacity: 0.9,
    marginTop: 20,
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  subtitleSmall: {
    fontSize: 16,
    marginTop: 16,
    lineHeight: 22,
  },
  buttonContainer: {
    width: "100%",
    flexDirection: "row",
    gap: 16,
    minHeight: 56,
  },
  buttonContainerSmall: {
    gap: 12,
    minHeight: 48,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  guestButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 12,
    minHeight: 56,
  },
  guestButtonText: {
    fontSize: 16,
    opacity: 0.9,
    textAlign: "center",
  },
  buttonSmall: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  buttonTextSmall: {
    fontSize: 15,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
});
