import type { AvailableLocale } from "@smog/i18n";
import * as translations from "@smog/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Get browser language or default to 'nl'
const getInitialLanguage = () => {
  const stored = localStorage.getItem("smog_language");
  if (
    stored &&
    translations.availableLocales.includes(stored as AvailableLocale)
  ) {
    return stored;
  }

  const browserLang = navigator.language.split("-")[0];
  if (translations.availableLocales.includes(browserLang as AvailableLocale)) {
    return browserLang;
  }

  return "nl"; // Default to Dutch
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: translations.en },
    fr: { translation: translations.fr },
    nl: { translation: translations.nl },
  },
  lng: getInitialLanguage(),
  fallbackLng: "nl",
  interpolation: {
    escapeValue: false,
  },
});

// Save language preference when it changes
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("smog_language", lng);
});

export default i18n;
