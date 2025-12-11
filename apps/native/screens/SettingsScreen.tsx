import { Ionicons } from "@expo/vector-icons";
import type { ThemeMode } from "@smog/styles";
import { FONT_SIZE, ICON_SIZE, SPACING } from "@smog/styles";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet from "@/components/bottom-sheet/BottomSheet";
import { useTheme } from "@/context/ThemeContext";
import { type Language, useTranslation } from "@/context/TranslationContext";

type RNGlobal = typeof globalThis & {
  Alert?: {
    alert?: (msg: string) => void;
  };
};

const SettingsScreen = () => {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { language, setLanguage, availableLanguages, t } = useTranslation();
  const router = useRouter();

  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);

  // For dev tools tap
  const [devTapCount, setDevTapCount] = useState(0);
  const [lastDevTap, setLastDevTap] = useState<number | null>(null);

  // Sync selectedLanguage with language context to avoid setState in render
  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const handleLanguageChange = useCallback(
    (newLanguage: Language) => {
      setSelectedLanguage(newLanguage);
      setLanguage(newLanguage);
      setShowLanguageSheet(false);
    },
    [setLanguage]
  );

  const handleThemeModeChange = useCallback(
    (newMode: ThemeMode) => {
      setThemeMode(newMode);
      setShowThemeSheet(false);
    },
    [setThemeMode]
  );

  const languageOptions = Object.entries(availableLanguages).map(
    ([key, label]) => ({
      key,
      label,
    })
  );

  const themeOptions = [
    { key: "system", label: t("settings.system") },
    { key: "light", label: t("settings.light") },
    { key: "dark", label: t("settings.dark") },
  ];

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

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{
          title: t("settings.title"),
          headerStyle: {
            backgroundColor: theme.primary,
          },
          headerBackButtonDisplayMode: "minimal",
          headerTintColor: theme.background,
          headerTitleStyle: {
            fontWeight: "700",
          },
        }}
      />

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
          onPress={() => setShowLanguageSheet(true)}
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
          onPress={() => setShowThemeSheet(true)}
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

      {/* Developer Tools button moved to bottom */}

      {/* Language Bottom Sheet */}
      <BottomSheet
        contentContainerStyle={{ padding: 16 }}
        onClose={() => setShowLanguageSheet(false)}
        snapPoints={["35%"]}
        visible={showLanguageSheet}
      >
        <Text
          style={[styles.settingLabel, { color: theme.text, marginBottom: 12 }]}
        >
          {t("settings.language")}
        </Text>
        {languageOptions.map((option) => (
          <TouchableOpacity
            activeOpacity={0.8}
            key={option.key}
            onPress={() => handleLanguageChange(option.key as Language)}
            style={[
              styles.settingRow,
              {
                backgroundColor:
                  selectedLanguage === option.key ? theme.primary : theme.card,
                borderColor: theme.border,
                marginBottom: 8,
              },
            ]}
          >
            <Text
              style={[
                styles.settingValue,
                {
                  color:
                    selectedLanguage === option.key
                      ? theme.background
                      : theme.text,
                },
              ]}
            >
              {option.label}
            </Text>
            {selectedLanguage === option.key && (
              <Ionicons
                color={theme.background}
                name="checkmark"
                size={ICON_SIZE.sm}
              />
            )}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      {/* Theme Bottom Sheet */}
      <BottomSheet
        contentContainerStyle={{ padding: 16 }}
        onClose={() => setShowThemeSheet(false)}
        snapPoints={["30%"]}
        visible={showThemeSheet}
      >
        <Text
          style={[styles.settingLabel, { color: theme.text, marginBottom: 12 }]}
        >
          {t("settings.theme")}
        </Text>
        {themeOptions.map((option) => (
          <TouchableOpacity
            activeOpacity={0.8}
            key={option.key}
            onPress={() => handleThemeModeChange(option.key as ThemeMode)}
            style={[
              styles.settingRow,
              {
                backgroundColor:
                  themeMode === option.key ? theme.primary : theme.card,
                borderColor: theme.border,
                marginBottom: 8,
              },
            ]}
          >
            <Text
              style={[
                styles.settingValue,
                {
                  color:
                    themeMode === option.key ? theme.background : theme.text,
                },
              ]}
            >
              {option.label}
            </Text>
            {themeMode === option.key && (
              <Ionicons
                color={theme.background}
                name="checkmark"
                size={ICON_SIZE.sm}
              />
            )}
          </TouchableOpacity>
        ))}
      </BottomSheet>
      {/* Developer Tools button at bottom, requires 5 taps */}
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
                  globalAlert.alert("Tap 5 times to open Developer Tools");
                }
              }
            };

            // If first tap or too slow, reset
            if (devTapCount === 0 || !lastDevTap || now - lastDevTap >= 2000) {
              setDevTapCount(1);
              setLastDevTap(now);
              showDevToolsAlert();
              return;
            }

            // If 5th tap within interval, open dev tools
            if (devTapCount + 1 >= 5) {
              setDevTapCount(0);
              setLastDevTap(null);
              router.push("/settings/developer-tools");
              return;
            }

            // Otherwise, increment tap count
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.md,
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
  settingOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  settingText: {
    fontSize: FONT_SIZE.md,
  },
  optionsContainer: {
    flexDirection: "column",
  },
  devToolsContainer: {
    marginTop: "auto",
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  devToolsButton: {
    marginTop: SPACING.lg,
  },
});

export default SettingsScreen;
