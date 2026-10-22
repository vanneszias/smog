// biome-ignore-all lint/performance/noBarrelFile: the `@smog/translation/client` entry point (site only).
/** `@smog/translation/client`: TanStack Query hooks over the typed `translation` slice. Never imports ./server. */
export {
  languageRefusalOf,
  stringConflictOf,
  useApplyImport,
  useExportStrings,
  useLanguageActions,
  useLanguages,
  usePreviewImport,
  useSaveString,
  useTranslationCoverage,
  useTranslationStrings,
  validationCodeOf,
} from "./hooks";
export { TRANSLATION_STALE_TIME } from "./slice";
