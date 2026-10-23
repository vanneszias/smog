// biome-ignore-all lint/performance/noBarrelFile: the `@smog/translation/client` entry point (site only).
/** `@smog/translation/client`: TanStack Query hooks over the typed `translation` slice. Never imports ./server. */
export {
  type AudioFile,
  type AudioProblem,
  AudioUploadError,
  audioFileProblem,
  audioProblemOf,
  audioTypeOf,
  uploadAudioFile,
  useAudioActions,
  useGestureAudio,
} from "./audio";
export {
  languageRefusalOf,
  legalConflictOf,
  legalIssuesOf,
  stringConflictOf,
  useApplyImport,
  useExportStrings,
  useLanguageActions,
  useLanguages,
  useLegalActions,
  useLegalDetail,
  useLegalOverview,
  useLegalVersion,
  usePreviewImport,
  useSaveString,
  useTranslationCoverage,
  useTranslationStrings,
  validationCodeOf,
} from "./hooks";
export { TRANSLATION_STALE_TIME } from "./slice";
