import { useActionSheet } from "@expo/react-native-action-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeMode } from "@smog/styles";
import { FONT_SIZE, ICON_SIZE, SPACING } from "@smog/styles";
import { Stack, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { type Language, useTranslation } from "@/context/TranslationContext";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "@/lib/openpanel";

type RNGlobal = typeof globalThis & {
  Alert?: {
    alert?: (msg: string) => void;
  };
};

const SettingsScreen = () => {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { language, setLanguage, availableLanguages, t } = useTranslation();
  const router = useRouter();
  const { showActionSheetWithOptions } = useActionSheet();
  const analyticsConsent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsent,
    getAnalyticsConsent
  );

  const [selectedLanguage, setSelectedLanguage] = useState(language);

  // For dev tools tap
  const [devTapCount, setDevTapCount] = useState(0);
  const [lastDevTap, setLastDevTap] = useState<number | null>(null);

  // Sync selectedLanguage with language context to avoid setState in render
  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const languageOptions = Object.entries(availableLanguages).map(
    ([key, label]) => ({
      key,
      label,
    })
  );

  const themeOptions = useMemo(
    () => [
      { key: "system", label: t("settings.system") },
      { key: "light", label: t("settings.light") },
      { key: "dark", label: t("settings.dark") },
    ],
    [t]
  );

  const getCurrentLanguageLabel = () => availableLanguages[selectedLanguage];

  const getCurrentThemeLabel = () => {
    switch (themeMode) {
      case "system":
        return t("settings.system");
      case "light":
        return t("settings.light");
      case "dark":
        return t("settings.dark");
      default:
        return t("settings.system");
    }
  };

  const showLanguageActionSheet = useCallback(() => {
    const options = [
      ...languageOptions.map((o) => o.label),
      t("common.cancel"),
    ];
    const cancelButtonIndex = options.length - 1;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: t("settings.language"),
        containerStyle: { backgroundColor: theme.card },
        textStyle: { color: theme.text },
        titleTextStyle: { color: theme.textLight },
      },
      (selectedIndex) => {
        if (
          selectedIndex !== undefined &&
          selectedIndex !== cancelButtonIndex
        ) {
          const selected = languageOptions[selectedIndex];
          if (selected) {
            setSelectedLanguage(selected.key as Language);
            setLanguage(selected.key as Language);
          }
        }
      }
    );
  }, [languageOptions, showActionSheetWithOptions, setLanguage, t, theme]);

  const showThemeActionSheet = useCallback(() => {
    const options = [...themeOptions.map((o) => o.label), t("common.cancel")];
    const cancelButtonIndex = options.length - 1;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: t("settings.theme"),
        containerStyle: { backgroundColor: theme.card },
        textStyle: { color: theme.text },
        titleTextStyle: { color: theme.textLight },
      },
      (selectedIndex) => {
        if (
          selectedIndex !== undefined &&
          selectedIndex !== cancelButtonIndex
        ) {
          const selected = themeOptions[selectedIndex];
          if (selected) {
            setThemeMode(selected.key as ThemeMode);
          }
        }
      }
    );
  }, [themeOptions, showActionSheetWithOptions, setThemeMode, t, theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: t("settings.title"),
          headerBackButtonDisplayMode: "minimal",
          ...(Platform.OS === "ios"
            ? {
                headerLargeTitle: true,
                headerLargeTitleStyle: {
                  color: theme.text,
                },
                headerTransparent: true,
                headerBlurEffect: "systemChromeMaterial",
                headerShadowVisible: false,
                headerTintColor: theme.primary,
                headerTitleStyle: {
                  fontWeight: "600",
                  color: theme.text,
                },
              }
            : {
                headerStyle: {
                  backgroundColor: theme.primary,
                },
                headerTintColor: theme.background,
                headerTitleStyle: {
                  fontWeight: "700",
                },
              }),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior={
          Platform.OS === "ios" ? "automatic" : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingContainer}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>
            {t("settings.auth")}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push("/settings/account")}
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.settingValue, { color: theme.text }]}>
              {t("settings.manageAccount")}
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.settingContainer}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>
            {t("settings.language")}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={showLanguageActionSheet}
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.settingValue, { color: theme.text }]}>
              {getCurrentLanguageLabel()}
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-down"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.settingContainer}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>
            {t("settings.theme")}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={showThemeActionSheet}
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.settingValue, { color: theme.text }]}>
              {getCurrentThemeLabel()}
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-down"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.settingContainer}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>
            {t("settings.analyticsTitle")}
          </Text>
          <View
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.analyticsCopy}>
              <Text style={[styles.settingValue, { color: theme.text }]}>
                {t("settings.analyticsTitle")}
              </Text>
              <Text
                style={[styles.settingDescription, { color: theme.textLight }]}
              >
                {t("settings.analyticsDescription")}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t("settings.analyticsTitle")}
              onValueChange={async (enabled) => {
                await setAnalyticsConsent(enabled);
              }}
              trackColor={{ true: theme.primary }}
              value={analyticsConsent === true}
            />
          </View>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL("https://app.smog.vlaanderen/privacy")
            }
          >
            <Text style={[styles.privacyLink, { color: theme.primary }]}>
              {t("settings.privacyPolicy")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Developer tooling is never exposed in store builds. */}
        {__DEV__ ? (
          <View style={styles.devToolsContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const now = Date.now();

                const showDevToolsAlert = () => {
                  if (typeof window !== "undefined") {
                    window.alert("Tap 5 times to open Developer Tools");
                  } else {
                    const globalAlert = (globalThis as RNGlobal).Alert;
                    const hasAlert =
                      !!globalAlert?.alert &&
                      typeof globalAlert.alert === "function";
                    if (hasAlert) {
                      globalAlert?.alert?.(
                        "Tap 5 times to open Developer Tools"
                      );
                    }
                  }
                };

                if (
                  devTapCount === 0 ||
                  !lastDevTap ||
                  now - lastDevTap >= 2000
                ) {
                  setDevTapCount(1);
                  setLastDevTap(now);
                  showDevToolsAlert();
                  return;
                }

                if (devTapCount + 1 >= 5) {
                  setDevTapCount(0);
                  setLastDevTap(null);
                  router.push("/settings/developer-tools");
                  return;
                }

                setDevTapCount(devTapCount + 1);
                setLastDevTap(now);
              }}
              style={[
                styles.settingRow,
                styles.devToolsButton,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.settingValue,
                  { color: theme.text, textAlign: "center" },
                ]}
              >
                {t("settings.openDeveloperTools")}
              </Text>
              <Ionicons
                color={theme.textLight}
                name="chevron-forward"
                size={ICON_SIZE.sm}
              />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Attribution */}
        <View style={styles.attributionContainer}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => Linking.openURL("https://zias.be")}
          >
            <Text style={[styles.attributionText, { color: theme.textLight }]}>
              Gemaakt met ♡ door zias.be
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  settingContainer: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  settingLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "700",
    marginBottom: SPACING.lg,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
  },
  settingValue: {
    fontSize: FONT_SIZE.md,
    flex: 1,
  },
  settingDescription: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  analyticsCopy: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  privacyLink: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    textDecorationLine: "underline",
  },
  devToolsContainer: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.md,
  },
  devToolsButton: {
    marginTop: SPACING.lg,
  },
  attributionContainer: {
    marginTop: SPACING.xxl,
    alignItems: "center",
    paddingHorizontal: SPACING.md,
  },
  attributionText: {
    fontSize: FONT_SIZE.xs,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});

export default SettingsScreen;
