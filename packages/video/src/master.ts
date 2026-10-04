import { z } from "zod";
import { muxAssetDataSchema } from "./assets";
import { type Mux, muxRequest } from "./client";

/**
 * The render's source (phase 7 ruling 4, steps `source-lookup` and
 * `source-poll-<n>`): the gesture's Mux asset and its master MP4 (the
 * highest-quality file, kept for 24 h once master access is on).
 */

const playbackIdLookupSchema = z.object({
  id: z.string(),
  object: z.object({ id: z.string(), type: z.string() }),
  policy: z.string(),
});

/**
 * `GET /video/v1/playback-ids/:id`: the asset behind a playback id, or
 * `null` when Mux does not know it in this environment (404) or the id
 * belongs to a live stream.
 */
export async function assetIdForPlayback(
  mux: Mux,
  playbackId: string
): Promise<string | null> {
  const data = await muxRequest(
    mux,
    `/video/v1/playback-ids/${encodeURIComponent(playbackId)}`,
    { nullOn404: true, schema: playbackIdLookupSchema }
  );
  return data?.object.type === "asset" ? data.object.id : null;
}

function assetPath(assetId: string): string {
  return `/video/v1/assets/${encodeURIComponent(assetId)}`;
}

/**
 * Turns temporary master access on (`PUT …/master-access`), unless it is
 * on already: idempotent, so a replayed step sends no second PUT. Mux
 * turns it off again after 24 h.
 * - `"enabled"`: this call turned it on;
 * - `"already-on"`: it was on;
 * - `"missing"`: Mux does not know the asset.
 */
export async function enableMasterAccess(
  mux: Mux,
  assetId: string
): Promise<"enabled" | "already-on" | "missing"> {
  const asset = await muxRequest(mux, assetPath(assetId), {
    nullOn404: true,
    schema: muxAssetDataSchema,
  });
  if (asset === null) {
    return "missing";
  }
  if (asset.master_access === "temporary") {
    return "already-on";
  }
  await muxRequest(mux, `${assetPath(assetId)}/master-access`, {
    body: { master_access: "temporary" },
    method: "PUT",
    schema: muxAssetDataSchema,
  });
  return "enabled";
}

/**
 * The master MP4's state. `url` is a signed, temporary URL: it must never
 * be logged or kept in Workflow step state (ruling 4, I-3).
 */
export type MasterState =
  | { status: "ready"; url: string }
  | { status: "preparing" | "errored" | "none" };

/**
 * The asset's master: `none` when master access is off (or expired) or
 * Mux does not know the asset, `ready` only with its URL. A state Mux
 * may add later counts as `preparing`, so the polls go on and end in the
 * rendition fallback.
 */
export async function masterState(
  mux: Mux,
  assetId: string
): Promise<MasterState> {
  const asset = await muxRequest(mux, assetPath(assetId), {
    nullOn404: true,
    schema: muxAssetDataSchema,
  });
  const master = asset?.master;
  if (!master) {
    return { status: "none" };
  }
  if (master.status === "ready" && master.url) {
    return { status: "ready", url: master.url };
  }
  if (master.status === "errored") {
    return { status: "errored" };
  }
  return { status: "preparing" };
}
