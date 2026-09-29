import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import logger from "@/utils/logger";

export default function WelcomeScreen() {
  const { continueAsGuest, signIn, user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const isSmallScreen = height < 700;
  const shouldStackButtons = width < 420;

  const handleSignInSignUp = async () => {
    try {
      logger.log("[Welcome] Starting WorkOS sign-in");
      signIn();
    } catch (error) {
      logger.error("[Welcome] Sign-in error:", error);
      Alert.alert(t("common.error"), t("auth.errors.signInFailed"));
    }
  };

  const handleGuestAccess = async () => {
    await continueAsGuest?.();
    router.replace("/(tabs)");
  };

  useEffect(() => {
    if (user) {
      router.replace("/(tabs)");
    }
  }, [router, user]);

  // If user is already signed in, redirect them
  if (user) {
    return null;
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
            shouldStackButtons ? styles.buttonContainerStacked : null,
          ]}
        >
          <TouchableOpacity
            accessibilityRole="button"
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
            accessibilityRole="button"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: "row",
    gap: 16,
    minHeight: 56,
    width: "100%",
  },
  buttonContainerSmall: {
    gap: 12,
    minHeight: 48,
  },
  buttonContainerStacked: {
    flexDirection: "column",
  },
  buttonSmall: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonTextSmall: {
    fontSize: 15,
  },
  container: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  contentSmall: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  guestButton: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  guestButtonText: {
    fontSize: 16,
    opacity: 0.9,
    textAlign: "center",
  },
  logo: {
    height: 150,
    marginBottom: 24,
    width: 220,
  },
  logoContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 24,
    marginTop: 20,
    opacity: 0.9,
    paddingHorizontal: 10,
    textAlign: "center",
  },
  subtitleSmall: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
});
