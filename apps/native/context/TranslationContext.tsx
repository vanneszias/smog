import type React from "react";
import { createContext, useContext } from "react";
import { useTranslation as useI18nTranslation } from "react-i18next";
import type { Language } from "@/utils/i18n";
import { AVAILABLE_LANGUAGES } from "@/utils/i18n";
import logger from "@/utils/logger";

// Define context type
interface TranslationContextType {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  availableLanguages: typeof AVAILABLE_LANGUAGES;
  isReady: boolean;
}

// Create context
const TranslationContext = createContext<TranslationContextType | undefined>(
  undefined
);

// Create provider component
export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t, i18n: i18nInstance, ready } = useI18nTranslation();

  // Function to set language
  const setLanguage = async (newLanguage: Language) => {
    try {
      await i18nInstance.changeLanguage(newLanguage);
    } catch (error) {
      logger.error("Failed to change language:", error);
    }
  };

  // Enhanced translation function that handles interpolation better
  const translate = (
    key: string,
    params?: Record<string, string | number>
  ): string => t(key, params);

  // Provide context value
  const contextValue = {
    language: (i18nInstance.language as Language) || "en",
    setLanguage,
    t: translate,
    availableLanguages: AVAILABLE_LANGUAGES,
    isReady: ready,
  };

  return (
    <TranslationContext.Provider value={contextValue}>
      {children}
    </TranslationContext.Provider>
  );
};

// Custom hook for using translations
export const useTranslation = () => {
  const context = useContext(TranslationContext);

  if (context === undefined) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }

  return context;
};

// Export the language type for settings screens.
export type { Language } from "@/utils/i18n";
