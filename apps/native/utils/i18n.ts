import AsyncStorage from "@react-native-async-storage/async-storage";
// Import translation files from shared package
import { en, fr, nl } from "@smog/i18n";
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Define available languages
export type Language = "en" | "fr" | "nl";
export const DEFAULT_LANGUAGE: Language = "en";
export const AVAILABLE_LANGUAGES = {
  en: "English",
  fr: "Français",
  nl: "Nederlands",
};

// Get device locale and map to supported language
const getDeviceLanguage = (): Language => {
  const deviceLocales = getLocales();
  const deviceLanguage = deviceLocales[0]?.languageCode;

  // Map device language to supported languages
  switch (deviceLanguage) {
    case "fr":
      return "fr";
    case "nl":
      return "nl";
    default:
      return "en";
  }
};

// Custom language detector that uses AsyncStorage and device locale
const languageDetector = {
  type: "languageDetector" as const,
  async: true,
  detect: async (callback: (lng: string) => void) => {
    try {
      // First, try to get saved language from AsyncStorage
      const savedLanguage = await AsyncStorage.getItem("userLanguage");
      if (
        savedLanguage &&
        Object.keys(AVAILABLE_LANGUAGES).includes(savedLanguage)
      ) {
        callback(savedLanguage);
        return;
      }

      // If no saved language, use device locale
      const deviceLanguage = getDeviceLanguage();
      callback(deviceLanguage);
    } catch (error) {
      console.error("Error detecting language:", error);
      callback(DEFAULT_LANGUAGE);
    }
  },
  init: () => {
    /* noop */
  },
  cacheUserLanguage: async (lng: string) => {
    try {
      await AsyncStorage.setItem("userLanguage", lng);
    } catch (error) {
      console.error("Error saving language:", error);
    }
  },
};

// Initialize i18next
i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      nl: { translation: nl },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    debug: __DEV__,

    // Interpolation options
    interpolation: {
      escapeValue: false, // React already escapes values
      prefix: "{{",
      suffix: "}}",
    },

    // React options
    react: {
      useSuspense: false,
    },

    // Key separator for nested translations
    keySeparator: ".",
    nsSeparator: false,
  });

export default i18n;
