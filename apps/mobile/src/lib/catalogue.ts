import type { AppContract } from "@smog/api/client";
import {
  type CatalogueOverlay,
  type LanguageInfo,
  LOCALE_CODE_PATTERN,
  SHIPPED_LANGUAGES,
} from "@smog/i18n";
import { deviceLocaleTags } from "@smog/i18n/native";
import { useRpcQuery } from "@smog/rpc/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePreferences } from "./preferences";

/** How long an answer counts as fresh; a stale one is shown and refetched. */
const CATALOGUE_STALE_TIME = 5 * 60 * 1000;

export interface RuntimeCatalogue {
  /** The enabled languages; the shipped three until the server has answered once. */
  languages: readonly LanguageInfo[];
  /** The `ui_string` rows to merge over the bundled catalogue; none until then. */
  overlay: CatalogueOverlay;
}

const SHIPPED: RuntimeCatalogue = { languages: SHIPPED_LANGUAGES, overlay: {} };

/**
 * The language the app asks the server about: the stored choice, else the
 * device's first well-formed tag (the server answers with the closest
 * enabled language).
 */
export function wantedLocale(
  preference: string | null,
  device: readonly string[]
): string | null {
  return (
    preference ??
    device.find((tag) => LOCALE_CODE_PATTERN.test(tag.replaceAll("_", "-"))) ??
    null
  );
}

/**
 * The runtime catalogue (phase 10b ruling 1): fetched at start through
 * `system.i18n` and kept in the persisted query cache (`query-persist`), so
 * an app opened offline still has the last answer for a day and, beyond
 * that, the bundled base: a failed or missing answer is never an error.
 * Offline works from the shipped base alone.
 */
export function useRuntimeCatalogue(): RuntimeCatalogue {
  const [{ locale }] = usePreferences();
  const rpc = useRpcQuery<Pick<AppContract, "system">>();
  const device = useMemo(deviceLocaleTags, []);
  const { data } = useQuery(
    rpc.system.i18n.queryOptions({
      input: { locale: wantedLocale(locale, device) },
      staleTime: CATALOGUE_STALE_TIME,
    })
  );
  return useMemo(
    () =>
      data ? { languages: data.languages, overlay: data.overlay } : SHIPPED,
    [data]
  );
}
