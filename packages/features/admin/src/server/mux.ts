import { gesture, inList } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { RpcContext } from "@smog/rpc";
import {
  createDirectUpload,
  createMux,
  gestureUploadPassthrough,
  getAsset,
  getUpload,
  isAllowedUploadUrl,
  isGestureUpload,
  listAssets,
  type Mux,
  MuxApiError,
  type MuxUploadState,
  readUploadState,
} from "@smog/video";
import { isFinalUpload } from "@smog/video/schema";
import { asc, or } from "drizzle-orm";
import type { MuxAssetItem, MuxUploadProgress } from "../schema";
import { type AdminDeps, adminProcedure } from "./procedure";

/** Mux refused for its rate limit: the admin may retry (`RATE_LIMITED`). */
function muxRateLimited(error: unknown): boolean {
  return error instanceof MuxApiError && error.status === 429;
}

/** The Mux client for this request, or `null` when Mux is not configured. */
function muxFor(context: RpcContext, deps: AdminDeps): Mux | null {
  return createMux(context.env, { fetch: deps.muxFetch });
}

function fromState(state: MuxUploadState): MuxUploadProgress {
  return {
    ...(state.asset ? { asset: state.asset } : {}),
    ...(state.error ? { error: state.error } : {}),
    upload: state.upload,
  };
}

/**
 * Where the upload is, from the Mux API: the upload, then its asset once
 * Mux made one. `null` when Mux does not know it, or it is not a gesture
 * upload (an id from elsewhere never reveals another flow's asset).
 */
async function progressFromApi(
  mux: Mux,
  uploadId: string
): Promise<MuxUploadProgress | null> {
  const upload = await getUpload(mux, uploadId);
  if (!(upload && isGestureUpload(upload.passthrough))) {
    return null;
  }
  const progress: MuxUploadProgress = { upload: upload.status };
  if (upload.error) {
    progress.error = upload.error;
  }
  if (upload.assetId) {
    const asset = await getAsset(mux, upload.assetId);
    progress.asset = {
      id: upload.assetId,
      status: asset?.status ?? "preparing",
      ...(asset?.playbackId && asset.status === "ready"
        ? { playbackId: asset.playbackId }
        : {}),
    };
    if (asset?.error) {
      progress.error = asset.error;
    }
  }
  return progress;
}

/** The gestures that use each asset, by `mux_asset_id` or `playback_id`. */
async function usageOf(
  db: Db,
  assets: readonly { id: string; playbackId: string }[]
): Promise<Map<string, MuxAssetItem["usedBy"]>> {
  const usage = new Map<string, MuxAssetItem["usedBy"]>();
  if (assets.length === 0) {
    return usage;
  }
  const rows = await db
    .select({
      id: gesture.id,
      muxAssetId: gesture.muxAssetId,
      name: gesture.name,
      playbackId: gesture.playbackId,
    })
    .from(gesture)
    .where(
      or(
        inList(
          gesture.muxAssetId,
          assets.map((asset) => asset.id)
        ),
        inList(
          gesture.playbackId,
          assets.map((asset) => asset.playbackId)
        )
      )
    )
    .orderBy(asc(gesture.sortName), asc(gesture.id));
  for (const asset of assets) {
    usage.set(
      asset.id,
      rows
        .filter(
          (row) =>
            row.muxAssetId === asset.id || row.playbackId === asset.playbackId
        )
        .map((row) => ({ id: row.id, name: row.name }))
    );
  }
  return usage;
}

/**
 * The `mux` slice of the admin router (ruling 4). Without the Mux token
 * every procedure but `status` is `INVALID_STATE`. Mux API failures are
 * logged by `@smog/video` (`[video]`) and here (`[admin]`), and answer
 * `INTERNAL_SERVER_ERROR`.
 */
export function muxRoutes(deps: AdminDeps) {
  return {
    mux: {
      assets: adminProcedure.mux.assets.handler(
        async ({ context, errors, input }) => {
          const mux = muxFor(context, deps);
          if (!mux) {
            throw errors.INVALID_STATE();
          }
          try {
            const { hasMore, items } = await listAssets(mux, input);
            const usage = await usageOf(context.db, items);
            return {
              hasMore,
              items: items.map((item) => ({
                ...item,
                usedBy: usage.get(item.id) ?? [],
              })),
              page: input.page,
            };
          } catch (error) {
            console.error("[admin] Failed to list the Mux assets:", error);
            throw muxRateLimited(error) ? errors.RATE_LIMITED() : error;
          }
        }
      ),
      createUpload: adminProcedure.mux.createUpload.handler(
        async ({ context, errors }) => {
          const mux = muxFor(context, deps);
          if (!mux) {
            throw errors.INVALID_STATE();
          }
          try {
            const upload = await createDirectUpload(mux, {
              corsOrigin: new URL(context.env.SITE_URL).origin,
              passthrough: gestureUploadPassthrough(),
              test: context.env.ENVIRONMENT === "dev",
            });
            // The browser may only PUT where the CSP lets it (`*.mux.com`).
            if (
              !isAllowedUploadUrl(upload.url, mux.apiUrl, {
                allowFake: context.env.ENVIRONMENT === "dev",
              })
            ) {
              throw new Error(
                `[admin] Mux returned an upload URL on ${new URL(upload.url).host}, which the CSP does not allow`
              );
            }
            return { uploadId: upload.id, url: upload.url };
          } catch (error) {
            console.error("[admin] Failed to create a Mux upload:", error);
            throw muxRateLimited(error) ? errors.RATE_LIMITED() : error;
          }
        }
      ),
      status: adminProcedure.mux.status.handler(({ context }) => ({
        configured: muxFor(context, deps) !== null,
      })),
      uploadStatus: adminProcedure.mux.uploadStatus.handler(
        async ({ context, errors, input }) => {
          const mux = muxFor(context, deps);
          if (!mux) {
            throw errors.INVALID_STATE();
          }
          const state = await readUploadState(context.kv, input.uploadId);
          if (state && isFinalUpload(state)) {
            return fromState(state);
          }
          let progress: MuxUploadProgress | null;
          try {
            progress = await progressFromApi(mux, input.uploadId);
          } catch (error) {
            if (state) {
              // The webhook's record is still the best answer we have.
              console.warn(
                "[admin] Mux is unreachable; answering the upload status from KV"
              );
              return fromState(state);
            }
            console.error("[admin] Failed to read a Mux upload:", error);
            throw muxRateLimited(error) ? errors.RATE_LIMITED() : error;
          }
          if (!progress) {
            throw errors.NOT_FOUND();
          }
          return progress;
        }
      ),
    },
  };
}
