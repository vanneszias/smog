import { z } from "zod";
import { type Mux, MuxApiError, muxRequest } from "./client";
import {
  ASSET_STATUSES,
  type AssetStatus,
  MUX_ASSETS_PAGE_MAX,
} from "./schema";

const playbackIdSchema = z.object({ id: z.string(), policy: z.string() });

/**
 * One static rendition file (`static_renditions.files[]`). Strings, not
 * enums: a status or name Mux adds later must not make the asset
 * unreadable. The `static_renditions` API gives each file its own
 * `status`; the deprecated `mp4_support` lists `low.mp4` … `high.mp4` (or
 * `capped-1080p.mp4`), whose readiness was the object's `status`.
 */
export const muxStaticRenditionFileSchema = z.object({
  ext: z.string().nullish(),
  id: z.string().nullish(),
  name: z.string().nullish(),
  resolution: z.string().nullish(),
  status: z.string().nullish(),
});

export const muxAssetDataSchema = z.object({
  aspect_ratio: z.string().nullish(),
  /** Unix seconds, as a string. */
  created_at: z.union([z.string(), z.number()]).nullish(),
  duration: z.number().nullish(),
  errors: z
    .object({
      messages: z.array(z.string()).nullish(),
      type: z.string().nullish(),
    })
    .nullish(),
  id: z.string(),
  /**
   * Master access (phase 7): present while `master_access` is `temporary`
   * and the URL has not expired. The status is a string, not an enum: a
   * state Mux adds later must not make the whole asset unreadable.
   */
  master: z
    .object({ status: z.string().nullish(), url: z.string().nullish() })
    .nullish(),
  master_access: z.string().nullish(),
  /** The deprecated MP4 setting (`none`, `standard`, `capped-1080p`, …). */
  mp4_support: z.string().nullish(),
  passthrough: z.string().nullish(),
  playback_ids: z.array(playbackIdSchema).nullish(),
  static_renditions: z
    .object({
      files: z.array(muxStaticRenditionFileSchema).nullish(),
      status: z.string().nullish(),
    })
    .nullish(),
  status: z.enum(ASSET_STATUSES),
  upload_id: z.string().nullish(),
});

type MuxAssetData = z.infer<typeof muxAssetDataSchema>;

export interface MuxAsset {
  aspectRatio: string | null;
  /** Milliseconds since the epoch. */
  createdAt: number;
  duration: number | null;
  error: string | null;
  id: string;
  /** The deprecated `mp4_support`, or `null` when Mux did not send one. */
  mp4Support: string | null;
  passthrough: string | null;
  /** The first `public` playback id; `null` when it has none. */
  playbackId: string | null;
  /** `static_renditions` (see `staticRenditionState`). */
  staticRenditions: StaticRenditions | null;
  status: AssetStatus;
  uploadId: string | null;
}

export interface StaticRenditionFile {
  id: string | null;
  name: string | null;
  resolution: string | null;
  status: string | null;
}

export interface StaticRenditions {
  files: StaticRenditionFile[];
  /** The object's own status (the deprecated `mp4_support` sets it). */
  status: string | null;
}

export function toStaticRenditionFile(
  file: z.infer<typeof muxStaticRenditionFileSchema>
): StaticRenditionFile {
  return {
    id: file.id ?? null,
    name: file.name ?? null,
    resolution: file.resolution ?? null,
    status: file.status ?? null,
  };
}

/** The first public playback id of an asset (signed ones never play on the site). */
export function publicPlaybackId(
  playbackIds: readonly { id: string; policy: string }[] | null | undefined
): string | null {
  return playbackIds?.find((entry) => entry.policy === "public")?.id ?? null;
}

function toMuxAsset(data: MuxAssetData): MuxAsset {
  const seconds = Number(data.created_at ?? 0);
  return {
    aspectRatio: data.aspect_ratio ?? null,
    createdAt: Number.isFinite(seconds) ? seconds * 1000 : 0,
    duration: data.duration ?? null,
    error: data.errors
      ? data.errors.messages?.join(" ") || data.errors.type || null
      : null,
    id: data.id,
    mp4Support: data.mp4_support ?? null,
    passthrough: data.passthrough ?? null,
    playbackId: publicPlaybackId(data.playback_ids),
    staticRenditions: data.static_renditions
      ? {
          files: (data.static_renditions.files ?? []).map(
            toStaticRenditionFile
          ),
          status: data.static_renditions.status ?? null,
        }
      : null,
    status: data.status,
    uploadId: data.upload_id ?? null,
  };
}

/** `GET /video/v1/assets/:id`, or `null` when Mux does not know it. */
export async function getAsset(mux: Mux, id: string): Promise<MuxAsset | null> {
  const data = await muxRequest(
    mux,
    `/video/v1/assets/${encodeURIComponent(id)}`,
    { nullOn404: true, schema: muxAssetDataSchema }
  );
  return data ? toMuxAsset(data) : null;
}

/**
 * `DELETE /video/v1/assets/:id` (phase 6 task 5, J-01: the expiry sweep
 * deletes a sponsored video). `true` when Mux deleted it, `false` when Mux
 * no longer knows it (404 counts as done, so a re-run is harmless). Any
 * other answer or a network failure throws (`MuxApiError` for an answer),
 * logged with `[video]`; the sweep logs and swallows it.
 */
export async function deleteAsset(mux: Mux, id: string): Promise<boolean> {
  const path = `/video/v1/assets/${encodeURIComponent(id)}`;
  let response: Response;
  try {
    response = await mux.fetch(`${mux.apiUrl}${path}`, {
      headers: { accept: "application/json", authorization: mux.authorization },
      method: "DELETE",
    });
  } catch (error) {
    console.error(`[video] Failed to reach Mux (DELETE ${path}):`, error);
    throw error;
  }
  await response.body?.cancel();
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    const error = new MuxApiError(
      `[video] Mux answered ${response.status} to DELETE ${path}`,
      response.status
    );
    console.error(error.message);
    throw error;
  }
  return true;
}

/** An asset in the picker: only ones with a public playback id. */
export interface MuxAssetSummary {
  aspectRatio: string | null;
  createdAt: number;
  duration: number | null;
  id: string;
  playbackId: string;
  status: AssetStatus;
}

export interface ListAssetsOptions {
  /** At most `MUX_ASSETS_PAGE_MAX`. */
  limit: number;
  /** 1-based. */
  page: number;
}

/**
 * One page of the environment's assets, newest first (Mux's order),
 * without the ones that have no public playback id. `hasMore` is true
 * when Mux filled the page, so the next page may hold more (Mux reports
 * no total).
 */
export async function listAssets(
  mux: Mux,
  { limit, page }: ListAssetsOptions
): Promise<{ hasMore: boolean; items: MuxAssetSummary[] }> {
  const size = Math.min(Math.max(1, Math.trunc(limit)), MUX_ASSETS_PAGE_MAX);
  const params = new URLSearchParams({
    limit: String(size),
    page: String(Math.max(1, Math.trunc(page))),
  });
  const data = await muxRequest(mux, `/video/v1/assets?${params}`, {
    schema: z.array(z.unknown()),
  });
  // One asset Mux describes in a way we do not know (a new status) must
  // not hide the whole page: it is skipped.
  const readable: MuxAssetData[] = [];
  for (const raw of data) {
    const parsed = muxAssetDataSchema.safeParse(raw);
    if (parsed.success) {
      readable.push(parsed.data);
    } else {
      console.warn("[video] Skipped a Mux asset it could not read");
    }
  }
  const items: MuxAssetSummary[] = [];
  for (const asset of readable.map(toMuxAsset)) {
    if (asset.playbackId) {
      items.push({
        aspectRatio: asset.aspectRatio,
        createdAt: asset.createdAt,
        duration: asset.duration,
        id: asset.id,
        playbackId: asset.playbackId,
        status: asset.status,
      });
    }
  }
  return { hasMore: data.length === size, items };
}
