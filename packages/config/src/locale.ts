import { z } from "zod";
import { LOCALE_CODE_MAX_LENGTH, LOCALE_CODE_PATTERN } from "./constants";

/**
 * A language code as input (`nl`, `fr`, `pt-BR`): its shape only. Whether the
 * language exists and is enabled is checked against the `language` table where
 * the value is used (`isLocale(value, enabledCodes)`), because languages are
 * data (phase 10b ruling 2).
 */
export const localeCodeSchema = z
  .string()
  .max(LOCALE_CODE_MAX_LENGTH)
  .regex(LOCALE_CODE_PATTERN);
