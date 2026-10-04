/**
 * The upload of the rendered MP4 (phase 7 ruling 7): a streamed `PUT` to
 * the job's Mux direct-upload URL, with `Content-Type: video/mp4` and the
 * file's `Content-Length`. A refusal or a network fault is `uploadFailed`
 * (retryable: the Workflow's next attempt gets a fresh upload URL). The URL
 * never reaches a message.
 */
import { stat } from "node:fs/promises";
import { describeError, RenderServerError } from "./errors";

export interface UploadArgs {
  filePath: string;
  /** Aborted when a newer request for the same job replaces this one. */
  signal: AbortSignal;
  url: string;
}

export interface UploadPort {
  upload: (args: UploadArgs) => Promise<{ bytes: number }>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** The real uploader: `fetch` with the file streamed from disk. */
export function createFetchUploader({
  fetch = globalThis.fetch,
}: {
  fetch?: Fetch;
} = {}): UploadPort {
  return {
    async upload({ filePath, signal, url }): Promise<{ bytes: number }> {
      const { size } = await stat(filePath);
      let response: Response;
      try {
        response = await fetch(url, {
          body: Bun.file(filePath),
          headers: {
            "Content-Length": String(size),
            "Content-Type": "video/mp4",
          },
          method: "PUT",
          signal,
        });
      } catch (error) {
        if (signal.aborted) {
          throw signal.reason;
        }
        // biome-ignore lint/style/useErrorCause: the cause is the third argument (the code comes first).
        throw new RenderServerError(
          "uploadFailed",
          `the upload could not be sent (${describeError(error, 300)})`,
          { cause: error }
        );
      }
      // Drain the answer; its body is Mux's (or the sink's), never ours.
      await response.arrayBuffer().catch(() => undefined);
      if (!response.ok) {
        throw new RenderServerError(
          "uploadFailed",
          `the upload was refused (HTTP ${response.status})`
        );
      }
      return { bytes: size };
    },
  };
}
