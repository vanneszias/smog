import { useRouter } from "expo-router";
import {
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import logger from "@/utils/logger";

const { height: screenHeight } = Dimensions.get("window");
const isSmallScreen = screenHeight < 700;

export default function WelcomeScreen() {
  const { continueAsGuest, signIn, user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handleSignInSignUp = async () => {
    try {
      logger.log("[Welcome] Starting WorkOS sign-in");
      signIn();
    } catch (error) {
      logger.error("[Welcome] Sign-in error:", error);
      Alert.alert(t("common.error"), "Failed to sign in. Please try again.");
    }
  };

  const handleGuestAccess = async () => {
    await continueAsGuest?.();
    router.replace("/(tabs)");
  };

  // If user is already signed in, redirect them
  if (user) {
    router.replace("/(tabs)");
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
});
