import {
  type MuxAsset,
  muxStaticRenditionFileSchema,
  type StaticRenditionFile,
  toStaticRenditionFile,
} from "./assets";
import { type Mux, muxRequest } from "./client";

/**
 * Static MP4 renditions (phase 8 ruling 5, carry 1): the render's fallback
 * source and the wizard's Player read `highest.mp4`, then `high.mp4`
 * (`renditionUrls`). New gesture uploads ask for `highest` at creation
 * (`createDirectUpload`); the migrated gesture assets get it through
 * `enableStaticRendition`, which the importer's `mux renditions` runs
 * (dry by default: Mux bills the stored MP4).
 */

/** What an asset's MP4 rendition is, for `mux renditions`. */
export const STATIC_RENDITION_STATES = [
  "ready",
  "preparing",
  "absent",
  "errored",
  "legacy-mp4",
] as const;

export type StaticRenditionState = (typeof STATIC_RENDITION_STATES)[number];

/** The resolutions this code asks for (Mux has more; only `highest` is read). */
export type StaticRenditionResolution = "highest";

const HIGHEST_NAME = "highest.mp4";
/** The deprecated `mp4_support: standard`'s best file, which `renditionUrls` tries second. */
const LEGACY_HIGH_NAME = "high.mp4";

function isHighest(file: StaticRenditionFile): boolean {
  return file.resolution === "highest" || file.name === HIGHEST_NAME;
}

/**
 * The asset's `highest.mp4` state, else its legacy `high.mp4`:
 * - the `highest` rendition by its own status: `ready`, `preparing`, and
 *   `errored` for a per-file `errored` or `skipped`; a status Mux may add
 *   later reads as `preparing`, so nothing is requested (and billed)
 *   twice;
 * - else `legacy-mp4` only when the deprecated `mp4_support` produced a
 *   ready `high.mp4` (the file's status, else the object's; the legacy
 *   API listed only finished files), `preparing` while it is being made;
 * - else `absent`: no static renditions, other resolutions only,
 *   `mp4_support` without a `high.mp4` (`capped-1080p`), or one that
 *   errored.
 */
export function staticRenditionState(
  asset: Pick<MuxAsset, "mp4Support" | "staticRenditions">
): StaticRenditionState {
  const files = asset.staticRenditions?.files ?? [];
  const highest = files.find(isHighest);
  if (highest) {
    switch (highest.status) {
      case "ready":
        return "ready";
      case "errored":
      case "skipped":
        return "errored";
      default:
        return "preparing";
    }
  }
  const high = files.find((file) => file.name === LEGACY_HIGH_NAME);
  if (!high) {
    return "absent";
  }
  const status = high.status ?? asset.staticRenditions?.status ?? "ready";
  if (status === "ready") {
    return "legacy-mp4";
  }
  return status === "preparing" ? "preparing" : "absent";
}

/**
 * `POST /video/v1/assets/:id/static-renditions` with `{ resolution }`.
 * Mux answers 201 with the new file (`highest.mp4`, `preparing`); `null`
 * when Mux does not know the asset. Any other refusal throws
 * `MuxApiError` (`retryAfterSeconds` on a 429). Billable: Mux stores one
 * MP4 per asset, so callers check `staticRenditionState` first.
 */
export async function enableStaticRendition(
  mux: Mux,
  assetId: string,
  resolution: StaticRenditionResolution
): Promise<StaticRenditionFile | null> {
  const data = await muxRequest(
    mux,
    `/video/v1/assets/${encodeURIComponent(assetId)}/static-renditions`,
    {
      body: { resolution },
      method: "POST",
      nullOn404: true,
      schema: muxStaticRenditionFileSchema,
    }
  );
  return data ? toStaticRenditionFile(data) : null;
}
