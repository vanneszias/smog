import type { SponsoredVideoInputProps } from "@smog/types/render";
import { AwsClient } from "aws4fetch";

/**
 * Remotion Lambda's "start" routine, as one SigV4-signed `fetch`.
 *
 * **Why not `@remotion/lambda-client`.** `lib/renderJob.ts` measured it at
 * +753 KiB gzipped in the Worker, for what is one HTTP request. This file
 * sends that request itself, and `remotionLambda.test.ts` runs the official
 * client beside it and fails if the two ever send different bytes. The client
 * is a dev dependency only: nothing here imports it.
 *
 * **What the official client actually does**, read from
 * `@remotion/lambda-client@4.0.484`'s `dist/esm/index.mjs`:
 *
 * - `renderMediaOnLambda` (line 76182) fills its defaults with
 *   `renderMediaOnLambdaOptionalToRequired` (76121) and calls
 *   `internalRenderMediaOnLambdaRaw` (76071).
 * - That calls `awsImplementation.callFunctionSync` with
 *   `makeLambdaRenderMediaPayload(input)` (75828) as the payload.
 * - `callFunctionSync` is `callFunctionSyncImplementation` (73240), over
 *   `callLambdaSyncWithoutRetry` (73215): a plain, buffered Lambda `Invoke`
 *   with `InvocationType: "RequestResponse"` and `JSON.stringify(payload)` as
 *   the body. It is **not** the response-streaming invoke the other routines
 *   use, and there is no event stream or `remotion_buffer:` framing to decode.
 * - On the function side (`@remotion/serverless@4.0.484`,
 *   `dist/inner-routine.js`), the start routine answers with
 *   `JSON.stringify(response)`, where `response` is `startHandler`'s
 *   `{ type: "success", bucketName, renderId }` (`dist/handlers/start.js`), or
 *   with `{ type: "error", message: err.stack }` if it throws.
 *
 * So the request below is `POST /2015-03-31/functions/<name>/invocations`, and
 * the answer is one JSON object. What is mirrored is spelled out beside each
 * piece.
 *
 * **Credentials** are read inside the call, never at module scope (the
 * `lib/mollie.ts` trap), and leave this file only inside a SigV4
 * `Authorization` header. This file never logs; the caller does, from
 * messages built here that carry no body, credential, prop or URL.
 */

/**
 * The Remotion version the deployed function was built from.
 *
 * `startHandler` calls `checkVersionMismatch` and refuses a payload whose
 * `version` differs, so this must move with `apps/render`'s `@remotion/*`
 * pins. The contract test fails if it drifts from the installed client's
 * `VERSION`.
 */
const REMOTION_VERSION = "4.0.484";

/**
 * How long the start routine may take before it is abandoned.
 *
 * The official synchronous invoke sets no timeout at all, and Workers `fetch`
 * has none either; a call that never answers would hold the request until the
 * platform kills it. Thirty seconds is Remotion's own stall timeout for its
 * streaming invokes (`STREAM_STALL_TIMEOUT`, line 73100), and far more than a
 * start routine needs: it writes one S3 object and invokes `launch`
 * asynchronously.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * An AWS region's shape, checked before it goes into the hostname: without
 * it, `region: "attacker.example/"` would send the signed request elsewhere.
 */
const AWS_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

/** Longest a Remotion error message may be when it is put in ours. */
const MAX_REMOTE_MESSAGE_LENGTH = 300;

/** One render of the sponsored-video composition, as the Worker asks for it. */
export interface StartRenderInput {
  composition: string;
  functionName: string;
  inputProps: SponsoredVideoInputProps;
  region: string;
  serveUrl: string;
  webhook: { customData: { jobId: string }; secret: string; url: string };
}

/**
 * What the start routine returns: where the render lives, and its id.
 *
 * Not exported: knip fails `bun release:check` on an exported type nothing
 * imports. A caller that needs it can export it then.
 */
interface StartedRender {
  bucketName: string;
  renderId: string;
}

/**
 * The start routine's payload, exactly as the official client builds it.
 *
 * This is `makeLambdaRenderMediaPayload(renderMediaOnLambdaOptionalToRequired(
 * options))` from `@remotion/lambda-client@4.0.484` (`dist/esm/index.mjs`,
 * lines 75828 and 76121), for
 * `{ codec: "h264", composition, serveUrl, region, functionName, inputProps,
 * privacy: "public", webhook, logLevel: "warn", maxRetries: 1 }` and every
 * other option at its default. The keys are in the order that function
 * returns them, so that `JSON.stringify` is byte-identical, and each value
 * notes where its default comes from when it is not one of ours.
 *
 * `inputProps` is inline because `compressInputProps` (71377) only uploads
 * props to S3 past the inline limit, which a sponsor name and two URLs never
 * approach; `serializeOrThrow` (71351) is `JSON.stringify` for props with no
 * `Date`, `Map`, `Set` or static file in them, which ours never have.
 */
function buildStartPayload(input: StartRenderInput): Record<string, unknown> {
  return {
    rendererFunctionName: null, // `?? null`
    framesPerLambda: null, // `?? null`
    concurrency: null, // `?? null`
    composition: input.composition,
    serveUrl: input.serveUrl,
    inputProps: { type: "payload", payload: JSON.stringify(input.inputProps) },
    codec: "h264",
    imageFormat: "jpeg", // `?? "jpeg"`
    crf: null, // `crf ?? null`
    envVariables: {}, // `?? {}`
    pixelFormat: null, // `?? undefined`, then `?? null`
    proResProfile: null, // `?? undefined`, then `?? null`
    x264Preset: null, // `?? null`
    gopSize: null, // `?? null`
    jpegQuality: 80, // `?? 80`
    maxRetries: 1,
    // Public because Mux ingests the output by its URL, and the Mux asset made
    // from it is `playback_policy: "public"` anyway
    // (`docs/superpowers/specs/2026-09-19-payload-migration-design.md`,
    // lines 1332-1354).
    privacy: "public",
    // "warn", not the client's "info" default. At "info" every routine's
    // `printLoggingGrepHelper` (`@remotion/serverless`,
    // `dist/print-logging-grep-helper.js`) logs `inputProps` to CloudWatch,
    // and ours carry the signed Mux `videoSrc`; at "warn" that line is not
    // written. Warnings and errors still are.
    logLevel: "warn",
    frameRange: null, // `?? null`
    outName: null, // `?? null`
    timeoutInMilliseconds: 30_000, // `?? 30000`
    chromiumOptions: {}, // `?? {}`
    scale: 1, // `?? 1`
    everyNthFrame: 1, // `?? 1`
    numberOfGifLoops: null, // `?? null`
    concurrencyPerLambda: 1, // `?? 1`
    downloadBehavior: { type: "play-in-browser" }, // `?? { type: "play-in-browser" }`
    muted: false, // `?? false`
    version: REMOTION_VERSION,
    overwrite: false, // `?? false`
    audioBitrate: null, // `?? null`
    videoBitrate: null, // `?? null`
    encodingBufferSize: null, // `?? null`
    encodingMaxRate: null, // `?? null`
    webhook: input.webhook,
    forceHeight: null, // `?? null`
    forceWidth: null, // `?? null`
    forceFps: null, // `?? null`
    forceDurationInFrames: null, // `?? null`
    bucketName: null, // `forceBucketName ?? null`
    audioCodec: null, // `?? null`
    type: "start", // `ServerlessRoutines.start`
    offthreadVideoCacheSizeInBytes: null, // `?? null`
    deleteAfter: null, // `?? null`
    colorSpace: null, // `?? null`
    preferLossless: false, // `?? false`
    forcePathStyle: false, // `?? false`
    metadata: null, // `?? null`
    licenseKey: null, // `licenseKey ?? apiKey ?? null`
    offthreadVideoThreads: null, // `?? null`
    mediaCacheSizeInBytes: null, // `?? null`
    storageClass: null, // `?? null`
    isProduction: null, // `?? null`
    sampleRate: 48_000, // `?? 48000`
  };
}

/** The credentials, read per call, or a throw naming neither value. */
function credentialsOrThrow(): {
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY?.trim();

  if (!(accessKeyId && secretAccessKey)) {
    throw new Error("[remotionLambda] AWS credentials are not set");
  }

  return { accessKeyId, secretAccessKey };
}

/**
 * The AWS error type of a refused request, from its `x-amzn-errortype`
 * header, which is what the SDK names its exception after. The body is never
 * read: it can echo the request.
 */
function awsErrorType(response: Response): string {
  const header = response.headers.get("x-amzn-errortype");

  return header?.split(":")[0]?.trim() || "unknown error type";
}

/**
 * The first line of Remotion's error, which is `err.stack` and therefore
 * starts `Error: <message>`; the frames below it are paths inside Lambda.
 */
function remoteMessage(message: unknown): string {
  const text = typeof message === "string" ? message : "no message";
  const firstLine = text.split("\n")[0]?.trim() || "no message";

  return firstLine.slice(0, MAX_REMOTE_MESSAGE_LENGTH);
}

/**
 * A transport failure, named. `AbortSignal.timeout` rejects with a
 * `TimeoutError` both while waiting for the response and while its body is
 * being read, so both land on the same message.
 */
function transportError(error: unknown, doing: string): Error {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new Error(
      `[remotionLambda] Lambda did not answer within ${REQUEST_TIMEOUT_MS} ms`,
      { cause: error }
    );
  }

  const name = error instanceof Error ? error.name : "unknown error";

  return new Error(`[remotionLambda] ${doing}: ${name}`, { cause: error });
}

/**
 * Releases a body that will not be read, best-effort: an unread body holds
 * the connection until it is collected. A failure to cancel changes nothing.
 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing to do: the response is being refused either way.
  }
}

/** The signed invoke, with transport failures named rather than rethrown raw. */
async function invoke(
  input: StartRenderInput,
  credentials: { accessKeyId: string; secretAccessKey: string }
): Promise<Response> {
  const client = new AwsClient({
    ...credentials,
    region: input.region,
    // The official client builds its `LambdaClient` with `maxAttempts: 1`
    // (`getServiceClient`, lines 72909-72970). A retried start is a second render.
    retries: 0,
    service: "lambda",
  });
  const url = `https://lambda.${input.region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(input.functionName)}/invocations`;

  try {
    return await client.fetch(url, {
      body: JSON.stringify(buildStartPayload(input)),
      headers: {
        "content-type": "application/octet-stream",
        "x-amz-invocation-type": "RequestResponse",
      },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw transportError(error, "Failed to reach Lambda");
  }
}

/**
 * Starts a render on Remotion Lambda and returns its id and bucket.
 *
 * It resolves once the start routine has created the render and invoked
 * `launch`; the render itself finishes later, and reports to `webhook.url`.
 *
 * The answer is read as the official client reads it:
 * `callLambdaSyncWithoutRetry` (line 73215) throws on a `FunctionError` and on
 * an empty or non-JSON payload, `callFunctionSyncImplementation` (73240)
 * throws on `type: "error"` with Remotion's message, and
 * `internalRenderMediaOnLambdaRaw` (76071) takes `renderId` and `bucketName`
 * from what is left. The AWS SDK throws on a non-2xx status; so does this.
 *
 * @throws `[remotionLambda] …`, naming the case, on every failure.
 */
export async function startRemotionRender(
  input: StartRenderInput
): Promise<StartedRender> {
  if (!AWS_REGION_PATTERN.test(input.region)) {
    throw new Error("[remotionLambda] Invalid region");
  }

  const credentials = credentialsOrThrow();
  const response = await invoke(input, credentials);

  if (!response.ok) {
    await discardBody(response);
    throw new Error(
      `[remotionLambda] Lambda refused the invoke with HTTP ${response.status} (${awsErrorType(response)})`
    );
  }

  const functionError = response.headers.get("x-amz-function-error");
  if (functionError) {
    await discardBody(response);
    throw new Error(
      `[remotionLambda] The Lambda function failed (${functionError.slice(0, MAX_REMOTE_MESSAGE_LENGTH)})`
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw transportError(error, "Failed to read Lambda's response");
  }
  if (text.length === 0) {
    throw new Error(
      `[remotionLambda] Lambda returned no payload (HTTP ${response.status})`
    );
  }

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      "[remotionLambda] The start routine's response is not JSON"
    );
  }

  const answer = (result ?? {}) as {
    bucketName?: unknown;
    message?: unknown;
    renderId?: unknown;
    type?: unknown;
  };

  if (answer.type === "error") {
    throw new Error(
      `[remotionLambda] The start routine failed: ${remoteMessage(answer.message)}`
    );
  }

  if (
    typeof answer.renderId !== "string" ||
    typeof answer.bucketName !== "string"
  ) {
    throw new Error(
      "[remotionLambda] The start routine's response has no renderId and bucketName"
    );
  }

  return { bucketName: answer.bucketName, renderId: answer.renderId };
}
