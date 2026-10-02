import { baseContract } from "@smog/rpc/contract";
import {
  muxAssetsInputSchema,
  muxAssetsPageSchema,
  muxCreatedUploadSchema,
  muxStatusSchema,
  muxUploadProgressSchema,
  muxUploadStatusInputSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * `admin.mux.*`: Mux direct uploads and the asset picker (ruling 4). The
 * browser PUTs the file straight to the Mux upload URL; no video byte
 * passes through the Worker. Without the Mux credentials (`MUX_TOKEN_ID`,
 * `MUX_TOKEN_SECRET`) every procedure but `status` answers `INVALID_STATE`,
 * and the UI offers the pasted playback id only.
 */
export const muxSlice = {
  mux: {
    /**
     * One page of the Mux assets with a public playback id, newest first,
     * each with the gestures that use it (`mux_asset_id` or `playback_id`).
     */
    assets: baseContract
      .input(muxAssetsInputSchema)
      .output(muxAssetsPageSchema),
    /**
     * A direct-upload URL for one gesture video (`cors_origin` the site
     * origin, public playback, passthrough `gesture-upload:<uuid>`).
     */
    createUpload: baseContract.output(muxCreatedUploadSchema),
    /** Whether Mux is configured (uploads and the picker work). */
    status: baseContract.output(muxStatusSchema),
    /**
     * Where an upload is: the webhook's KV record first, the Mux API while
     * that is not final. `NOT_FOUND` for an upload that is unknown or not a
     * gesture upload.
     */
    uploadStatus: baseContract
      .input(muxUploadStatusInputSchema)
      .output(muxUploadProgressSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "mux.assets": "read",
  "mux.createUpload": {
    exempt:
      "stores nothing: it only asks Mux for an upload URL; the gesture create or update that uses the asset is audited (ruling 4)",
  },
  "mux.status": "read",
  "mux.uploadStatus": "read",
} as const satisfies AdminProcedures<typeof muxSlice>;
