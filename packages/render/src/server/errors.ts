/**
 * The render server's failures (phase 7 ruling 7): a `RenderServerError`
 * carries a `RENDER_ERROR_CODES` code, and every answer and log line goes
 * through `scrubUrls`, because the source and upload URLs may be signed
 * and Remotion's and mediabunny's own messages name them (task 3 review,
 * I-2 and M-6). An error's `cause` is never logged or answered.
 */
import {
  RENDER_ERROR_MESSAGE_MAX,
  RENDER_ERROR_STATUS,
  type RenderErrorCode,
  type RenderResult,
} from "../contract";
import { SourceFetchError, SourceUnreadableError } from "../metadata";

/** A coded failure: its message is the answer's, so it must be URL-free. */
export class RenderServerError extends Error {
  override readonly name = "RenderServerError";
  readonly code: RenderErrorCode;

  constructor(code: RenderErrorCode, message: string, options?: ErrorOptions) {
    super(scrubUrls(message), options);
    this.code = code;
  }
}

/** The running render was replaced by a newer request for the same job. */
export class RenderSupersededError extends Error {
  override readonly name = "RenderSupersededError";

  constructor() {
    super("superseded by a newer request for the same job");
  }
}

const URL_PATTERN = /\b(?:https?|wss?|data|blob|file):[^\s"'`<>)\]]*/gi;

/** Replaces every URL (`http(s):`, `data:`, `file:`, …) with `<url>`. */
export function scrubUrls(text: string): string {
  return text.replace(URL_PATTERN, "<url>");
}

/** `Name: message`, URL-free and at most `max` characters; never the cause. */
export function describeError(
  error: unknown,
  max: number = RENDER_ERROR_MESSAGE_MAX
): string {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `unknown failure (${typeof error})`;
  return truncate(scrubUrls(text), max);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Maps any failure of a render to its code. The metadata reader's errors
 * have fixed URL-free messages; a source that cannot be fetched is
 * retryable (`renderFailed`, the Workflow resolves the source again), one
 * that cannot be read is final. Anything else is a `renderFailed` whose
 * message is the scrubbed `Name: message`.
 */
export function toRenderServerError(error: unknown): RenderServerError {
  if (error instanceof RenderServerError) {
    return error;
  }
  if (error instanceof SourceUnreadableError) {
    return new RenderServerError("sourceUnreadable", error.message);
  }
  if (error instanceof SourceFetchError) {
    return new RenderServerError("renderFailed", error.message);
  }
  if (error instanceof RenderSupersededError) {
    return new RenderServerError("renderFailed", error.message);
  }
  return new RenderServerError("renderFailed", describeError(error));
}

/** The JSON answer of a failure, with the contract's status for its code. */
export function failureResponse(error: RenderServerError): Response {
  const body: RenderResult = {
    code: error.code,
    message: truncate(scrubUrls(error.message), RENDER_ERROR_MESSAGE_MAX),
    ok: false,
  };
  return Response.json(body, { status: RENDER_ERROR_STATUS[error.code] });
}
