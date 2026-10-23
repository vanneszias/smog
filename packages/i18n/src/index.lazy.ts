// biome-ignore-all lint/performance/noBarrelFile: the package's public entry point without the shipped catalogues (the site's browser build, vite.config.ts); `index.ts` adds them
export {
  DEFAULT_LOCALE,
  LOCALE_CODE_MAX_LENGTH,
  LOCALE_CODE_PATTERN,
  LOCALES,
  type Locale,
  type ShippedLocale,
} from "@smog/config/constants";
export {
  applyValues,
  buildResources,
  type CatalogueOverlay,
  flattenMessages,
  pickOverlay,
  shippedMessages,
} from "./catalogue";
export {
  isLocale,
  type LocaleSources,
  matchLocale,
  resolveLocale,
} from "./detect";
export { dayRange, formatDate, formatList } from "./format";
export {
  DEFAULT_NAMESPACE,
  type Messages,
  type TranslationKey,
} from "./keys";
export {
  defaultLanguage,
  intlTag,
  type LanguageInfo,
  languageCodes,
  registerLanguages,
  SHIPPED_LANGUAGES,
} from "./languages";
export { createI18n, type Translate } from "./setup-web";
export {
  ensureCatalogues,
  isShippedLocale,
  loadCatalogue,
  type MessageTree,
} from "./store";
export {
  type PluralForm,
  type PluralProblem,
  placeholdersOf,
  pluralProblems,
  requiredPluralForms,
  splitPluralKey,
  type TranslationCheck,
  type TranslationIssue,
  UI_STRING_MAX_LENGTH,
  type ValidateOptions,
  validateTranslation,
} from "./validate";
