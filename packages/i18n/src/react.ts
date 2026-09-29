// Loads the CustomTypeOptions augmentation, so these hooks are typed by nl.json.
import type {} from "./keys";

// biome-ignore lint/performance/noBarrelFile: one react-i18next entry point for the kits and apps
export { I18nextProvider, Trans, useTranslation } from "react-i18next";
