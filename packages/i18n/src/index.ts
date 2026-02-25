// Re-export translation files
export { default as en } from "./locales/en.json";
export { default as fr } from "./locales/fr.json";
export { default as nl } from "./locales/nl.json";

// Export available locales
export const availableLocales = ["en", "fr", "nl"] as const;
export type AvailableLocale = (typeof availableLocales)[number];

// Translation keys type (based on en.json structure)
export interface TranslationKeys {
  search: {
    placeholder: string;
    noResults: string;
    enterSearchTerm: string;
    promptText: string;
    allCategories: string;
    offlineMode: string;
    backOnline: string;
    recentSearches: string;
    clear: string;
    foundResults: string;
    searching: string;
    retry: string;
    noGestures: string;
  };
  home: {
    loadingGestures: string;
    noGesturesFound: string;
  };
  favorites: {
    emptyMessage: string;
    added: string;
    removed: string;
    undo: string;
    error: string;
  };
  common: {
    back: string;
    cancel: string;
    error: string;
    comingSoon: string;
  };
  tabs: {
    home: string;
    search: string;
    favorites: string;
  };
  settings: {
    title: string;
    language: string;
    theme: string;
    system: string;
    light: string;
    dark: string;
  };
  notFound: {
    title: string;
    robotAriaLabel: string;
    speechBubble: {
      normal: string;
      success: string;
    };
    systemError: string;
    suggestion: string;
    heading: string;
    description: string;
    buttons: {
      takeMeHome: string;
      tryAgain: string;
    };
    selfDestruct: {
      label: string;
      labelWithCount: string;
      sequenceTitle: string;
      joke: string;
    };
    footer: {
      blameText: string;
      tellZias: string;
    };
    help: {
      hint: string;
      terminalTitle: string;
      terminalIntro: string;
      analyzing: string;
      availableCommands: string;
      commands: {
        home: string;
        konami: string;
        zias: string;
        retry: string;
        panic: string;
      };
      closeHint: string;
      closeButton: string;
    };
  };
}
