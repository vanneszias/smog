// biome-ignore-all lint/performance/noBarrelFile: the `@smog/translation/server` entry point (Worker only).
export {
  createTranslationRouter,
  type TranslationRouter,
} from "./router";
