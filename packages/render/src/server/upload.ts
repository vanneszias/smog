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

/** The pause before the one retry of a failed `PUT`. */
const RETRY_DELAY_MS = 2000;
const ATTEMPTS = 2;

interface PutFailure {
  error: RenderServerError;
  retryable: boolean;
}

/**
 * The real uploader: `fetch` with the file streamed from disk. A network
 * fault or a 5xx is retried once (a Mux direct-upload URL takes a fresh
 * `PUT`), so a transient fault does not cost a whole re-render through the
 * Workflow's step retry (review minor 6). A 4xx is final.
 */
export function createFetchUploader({
  fetch = globalThis.fetch,
  retryDelayMs = RETRY_DELAY_MS,
}: {
  fetch?: Fetch;
  retryDelayMs?: number;
} = {}): UploadPort {
  async function put(
    { filePath, signal, url }: UploadArgs,
    size: number
  ): Promise<PutFailure | null> {
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
      return {
        error: new RenderServerError(
          "uploadFailed",
          `the upload could not be sent (${describeError(error, 300)})`,
          { cause: error }
        ),
        retryable: true,
      };
    }
    // Drain the answer; its body is Mux's (or the sink's), never ours.
    await response.arrayBuffer().catch(() => undefined);
    if (response.ok) {
      return null;
    }
    return {
      error: new RenderServerError(
        "uploadFailed",
        `the upload was refused (HTTP ${response.status})`
      ),
      retryable: response.status >= 500,
    };
  }

  return {
    async upload(args): Promise<{ bytes: number }> {
      const { size } = await stat(args.filePath);
      for (let attempt = 1; ; attempt += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: the retry follows the first attempt.
        const failure = await put(args, size);
        if (failure === null) {
          return { bytes: size };
        }
        if (!failure.retryable || attempt >= ATTEMPTS) {
          throw failure.error;
        }
        await Bun.sleep(retryDelayMs);
        if (args.signal.aborted) {
          throw args.signal.reason;
        }
      }
    },
  };
}
