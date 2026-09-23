// Re-export translation files
export { default as en } from "./locales/en.json";
export { default as fr } from "./locales/fr.json";
export { default as nl } from "./locales/nl.json";

// Export available locales
export const availableLocales = ["en", "fr", "nl"] as const;
