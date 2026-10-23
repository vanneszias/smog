import { z } from "zod";
import { type Mux, muxRequest } from "./client";

/** The asset behind a playback id (the importer's `mux` commands). */

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
