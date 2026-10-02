// biome-ignore lint/performance/noBarrelFile: the package's public entry point
export { DEFAULT_LOCALE, LOCALES, type Locale } from "@smog/config/constants";
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
  resources,
  type TranslationKey,
} from "./keys";
export { createI18n, type Translate } from "./setup-web";
