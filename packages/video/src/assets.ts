import { z } from "zod";
import { type Mux, muxRequest } from "./client";
import {
  ASSET_STATUSES,
  type AssetStatus,
  MUX_ASSETS_PAGE_MAX,
} from "./schema";

const playbackIdSchema = z.object({ id: z.string(), policy: z.string() });

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
  passthrough: z.string().nullish(),
  playback_ids: z.array(playbackIdSchema).nullish(),
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
  passthrough: string | null;
  /** The first `public` playback id; `null` when it has none. */
  playbackId: string | null;
  status: AssetStatus;
  uploadId: string | null;
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
    passthrough: data.passthrough ?? null,
    playbackId: publicPlaybackId(data.playback_ids),
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
