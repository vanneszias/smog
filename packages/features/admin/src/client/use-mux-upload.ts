/**
 * Task 3: `useMuxUpload` and its controller. Everything exported here is
 * part of `@smog/admin/client` (`index.ts` re-exports this file).
 *
 * The flow (ruling 4): `admin.mux.createUpload` gives a signed Mux URL,
 * the browser PUTs the file there with one XHR (progress events; no video
 * byte passes through the Worker), then `admin.mux.uploadStatus` is polled
 * every 2 s until the upload is final. Polling gives up after 10 minutes
 * with a retry that resumes it. No audit (it stores nothing): the gesture
 * save that uses the asset is audited.
 */

import { isFinalUpload } from "@smog/video/schema";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { MuxCreatedUpload, MuxUploadProgress } from "../schema";
import { useAdminRpc } from "./slice";

export const MUX_POLL_INTERVAL_MS = 2000;
export const MUX_POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Why an upload stopped short of a ready video. */
export type MuxUploadFailure =
  /** `createUpload` failed (Mux down, or not configured). */
  | "create"
  /** The PUT to Mux failed or was refused. */
  | "transfer"
  /** Mux could not process the file (upload or asset errored). */
  | "processing"
  /** The upload was cancelled or its URL timed out at Mux. */
  | "cancelled"
  /** Still not ready after 10 minutes of polling: `retry()` resumes. */
  | "slow";

export type MuxUploadState =
  | { status: "idle" }
  | { file: MuxFile; status: "creating" }
  | { file: MuxFile; progress: number; status: "uploading"; uploadId: string }
  | { file: MuxFile; status: "processing"; uploadId: string }
  | {
      assetId: string;
      file: MuxFile;
      playbackId: string;
      status: "ready";
      uploadId: string;
    }
  | {
      detail?: string;
      file: MuxFile;
      reason: MuxUploadFailure;
      status: "failed";
      uploadId?: string;
    };

/** The part of a `File` the flow reads (and sends). */
export interface MuxFile {
  name: string;
  size: number;
  type: string;
}

/** The part of `XMLHttpRequest` the PUT uses (tests pass a fake). */
export interface MuxXhr {
  abort: () => void;
  onabort: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onload: ((event: unknown) => void) | null;
  open: (method: string, url: string) => void;
  send: (body: unknown) => void;
  setRequestHeader: (name: string, value: string) => void;
  status: number;
  upload: {
    onprogress:
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null;
  };
}

export interface MuxUploadDeps {
  createUpload: () => Promise<MuxCreatedUpload>;
  createXhr?: () => MuxXhr;
  /** Milliseconds now (tests pin it). */
  now?: () => number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  uploadStatus: (uploadId: string) => Promise<MuxUploadProgress>;
}

export interface MuxUploadController {
  /** Stops the PUT and the polling, and forgets the upload. */
  reset: () => void;
  /** Resumes polling (`slow`), or starts the same file again. */
  retry: () => void;
  start: (file: MuxFile) => void;
  readonly state: () => MuxUploadState;
  subscribe: (listener: () => void) => () => void;
}

function defaultXhr(): MuxXhr {
  return new XMLHttpRequest() as unknown as MuxXhr;
}

/**
 * The upload state machine, without React: idle → creating → uploading →
 * processing → ready, or failed with a reason. Every async step checks it
 * still belongs to the current run, so `reset()` or a new `start()` never
 * sees a late answer of the old one.
 */
export function createMuxUploadController(
  deps: MuxUploadDeps
): MuxUploadController {
  const {
    createUpload,
    createXhr = defaultXhr,
    now = Date.now,
    pollIntervalMs = MUX_POLL_INTERVAL_MS,
    pollTimeoutMs = MUX_POLL_TIMEOUT_MS,
    uploadStatus,
  } = deps;
  let state: MuxUploadState = { status: "idle" };
  let run = 0;
  let xhr: MuxXhr | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  function set(next: MuxUploadState): void {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function stop(): void {
    run += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (xhr) {
      const current = xhr;
      xhr = null;
      current.onabort = null;
      current.onerror = null;
      current.onload = null;
      current.abort();
    }
  }

  function fail(
    file: MuxFile,
    reason: MuxUploadFailure,
    extra: { detail?: string | undefined; uploadId?: string } = {}
  ): void {
    set({
      file,
      reason,
      status: "failed",
      ...(extra.detail ? { detail: extra.detail } : {}),
      ...(extra.uploadId ? { uploadId: extra.uploadId } : {}),
    });
  }

  function settle(
    file: MuxFile,
    uploadId: string,
    progress: MuxUploadProgress
  ): void {
    const { asset } = progress;
    if (asset?.status === "ready" && asset.playbackId) {
      set({
        assetId: asset.id,
        file,
        playbackId: asset.playbackId,
        status: "ready",
        uploadId,
      });
      return;
    }
    const reason =
      progress.upload === "cancelled" || progress.upload === "timed_out"
        ? "cancelled"
        : "processing";
    fail(file, reason, { detail: progress.error, uploadId });
  }

  function poll(file: MuxFile, uploadId: string): void {
    const mine = run;
    const deadline = now() + pollTimeoutMs;
    set({ file, status: "processing", uploadId });
    const tick = async (): Promise<void> => {
      timer = null;
      let progress: MuxUploadProgress | null = null;
      try {
        progress = await uploadStatus(uploadId);
      } catch (error) {
        // A failed poll is retried on the next tick, until the deadline.
        console.warn("[admin] Failed to read the Mux upload status:", error);
      }
      if (mine !== run) {
        return;
      }
      if (progress && isFinalUpload(progress)) {
        settle(file, uploadId, progress);
        return;
      }
      if (now() >= deadline) {
        fail(file, "slow", { uploadId });
        return;
      }
      timer = setTimeout(tick, pollIntervalMs);
    };
    timer = setTimeout(tick, 0);
  }

  function transfer(
    file: MuxFile,
    upload: MuxCreatedUpload,
    mine: number
  ): void {
    const request = createXhr();
    xhr = request;
    set({ file, progress: 0, status: "uploading", uploadId: upload.uploadId });
    request.upload.onprogress = (event) => {
      if (mine === run && event.lengthComputable && event.total > 0) {
        set({
          file,
          progress: Math.min(1, event.loaded / event.total),
          status: "uploading",
          uploadId: upload.uploadId,
        });
      }
    };
    request.onload = () => {
      if (mine !== run) {
        return;
      }
      xhr = null;
      if (request.status >= 200 && request.status < 300) {
        poll(file, upload.uploadId);
      } else {
        fail(file, "transfer", {
          detail: `HTTP ${request.status}`,
          uploadId: upload.uploadId,
        });
      }
    };
    request.onerror = () => {
      if (mine === run) {
        xhr = null;
        fail(file, "transfer", { uploadId: upload.uploadId });
      }
    };
    request.open("PUT", upload.url);
    if (file.type) {
      request.setRequestHeader("Content-Type", file.type);
    }
    request.send(file);
  }

  async function begin(file: MuxFile): Promise<void> {
    stop();
    const mine = run;
    set({ file, status: "creating" });
    let upload: MuxCreatedUpload;
    try {
      upload = await createUpload();
    } catch (error) {
      if (mine === run) {
        console.error("[admin] Failed to create a Mux upload:", error);
        fail(file, "create");
      }
      return;
    }
    if (mine === run) {
      transfer(file, upload, mine);
    }
  }

  return {
    reset: () => {
      stop();
      set({ status: "idle" });
    },
    retry: () => {
      if (state.status !== "failed") {
        return;
      }
      if (state.reason === "slow" && state.uploadId) {
        stop();
        poll(state.file, state.uploadId);
        return;
      }
      begin(state.file).catch(() => undefined);
    },
    start: (file) => {
      begin(file).catch(() => undefined);
    },
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface UseMuxUploadOptions {
  /** Tests pass a fake XHR. */
  createXhr?: () => MuxXhr;
}

/**
 * The upload flow for `MuxUpload`: `start(file)`, the live state, `retry()`
 * and `reset()`. Unmounting stops the PUT and the polling.
 */
export function useMuxUpload(options: UseMuxUploadOptions = {}) {
  const rpc = useAdminRpc();
  const [controller] = useState(() =>
    createMuxUploadController({
      createUpload: () => rpc.mux.createUpload.call(),
      ...(options.createXhr ? { createXhr: options.createXhr } : {}),
      uploadStatus: (uploadId) => rpc.mux.uploadStatus.call({ uploadId }),
    })
  );
  useEffect(() => () => controller.reset(), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.state,
    controller.state
  );
  return {
    reset: controller.reset,
    retry: controller.retry,
    start: controller.start,
    state,
  };
}
