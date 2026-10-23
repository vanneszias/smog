import type { AppContract } from "@smog/api/client";
import {
  type CatalogueOverlay,
  type LanguageInfo,
  languageCodes,
  resolveLocale,
  SHIPPED_LANGUAGES,
} from "@smog/i18n";
import { deviceLocaleTags } from "@smog/i18n/native";
import { useRpcQuery } from "@smog/rpc/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { usePreferences } from "./preferences";

/** How long an answer counts as fresh; a stale one is shown and refetched. */
const CATALOGUE_STALE_TIME = 5 * 60 * 1000;

export interface RuntimeCatalogue {
  /** The enabled languages; the shipped three until the server has answered once. */
  languages: readonly LanguageInfo[];
  /** The `ui_string` rows to merge over the bundled catalogue; none until then. */
  overlay: CatalogueOverlay;
  /** The language the app shows and asks the server for (`wantedLocale`). */
  wanted: string;
}

const SHIPPED_CODES = languageCodes(SHIPPED_LANGUAGES);

/**
 * The language the app shows and asks the server about: the stored choice,
 * else the first device language that is ENABLED (the same resolution as
 * `setupNative`), else the default. `enabled` is the last `system.i18n`
 * answer's list; the shipped three before the first one.
 */
export function wantedLocale(
  preference: string | null,
  device: readonly string[],
  enabled: readonly string[] = SHIPPED_CODES
): string {
  return resolveLocale({ device, preference }, enabled);
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
  // The enabled list comes from the answer itself: the first request
  // resolves against the shipped three, the next one against what the
  // server said (a device in `de` with `fr` second asks for `fr` once `de`
  // is known to be disabled). The previous answer stays while it refetches.
  const [enabled, setEnabled] = useState<readonly string[]>(SHIPPED_CODES);
  const wanted = wantedLocale(locale, device, enabled);
  const { data } = useQuery(
    rpc.system.i18n.queryOptions({
      input: { locale: wanted },
      placeholderData: keepPreviousData,
      staleTime: CATALOGUE_STALE_TIME,
    })
  );
  useEffect(() => {
    if (!data) {
      return;
    }
    const codes = languageCodes(data.languages);
    setEnabled((previous) =>
      previous.length === codes.length &&
      previous.every((code, index) => code === codes[index])
        ? previous
        : codes
    );
  }, [data]);
  return useMemo(
    () => ({
      languages: data ? data.languages : SHIPPED_LANGUAGES,
      overlay: data ? data.overlay : {},
      wanted,
    }),
    [data, wanted]
  );
}
