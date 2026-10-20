/**
 * Logging helpers for the Worker's top level (phase 9 task 8, ruling 14).
 *
 * Every Worker log line is `[service] event {json}` or
 * `[service] Failed to ...: <message>`. The one line that is neither is the
 * top-level error: `[error] <entry> {json}` with the error's name, a redacted
 * message and an id to find the request, never the stack or the error's own
 * properties (a failed `fetch` error can carry a URL, a header or a body).
 */

const MAX_MESSAGE_LENGTH = 300;
const REDACTED = "[redacted]";

/** An address: anything with an `@` between non-space characters. */
const EMAIL = /[^\s@<>"'(),;]+@[^\s@<>"'(),;]+/g;
/** A URL's query and fragment (re-edit and reset links carry tokens). */
const URL_TAIL = /(https?:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/g;
/** `Bearer abc`, `Basic abc`. */
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[^\s"',;]+/gi;
/** `token=abc`, `password: abc`, `"apiKey":"abc"`. */
const SECRET_PAIR =
  /\b(token|secret|password|passwd|authorization|cookie|set-cookie|api[_-]?key|code)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi;
/** A long unbroken run of token characters (a minted token, a key, a JWT part). */
const LONG_RUN = /[A-Za-z0-9_\-+/=.]{32,}/g;

/**
 * The text with addresses, URL queries, credentials and long token-like
 * runs masked, cut to 300 characters. Idempotent.
 */
export function redactMessage(text: string): string {
  return text
    .replace(EMAIL, REDACTED)
    .replace(URL_TAIL, "$1")
    .replace(AUTH_SCHEME, `$1 ${REDACTED}`)
    .replace(SECRET_PAIR, `$1$2${REDACTED}`)
    .replace(LONG_RUN, REDACTED)
    .slice(0, MAX_MESSAGE_LENGTH);
}

export interface ErrorSummary {
  message: string;
  name: string;
}

/** An unknown thrown value as its name and a redacted message. */
export function errorSummary(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    return {
      message: redactMessage(error.message),
      name: error.name.slice(0, 64),
    };
  }
  return {
    message: typeof error === "string" ? redactMessage(error) : "",
    name: typeof error,
  };
}

/** The Worker entry points that may let an error escape. */
export type TopLevelEntry = "fetch" | "queue" | "scheduled";

/**
 * Logs an unhandled error of a Worker entry point as
 * `[error] <entry> {"id":…,"message":…,"name":…}` (the `id` is the request's
 * `cf-ray`, or a generated one for `queue` and `scheduled`, so the line can
 * be found next to the platform's own log). `log` is injectable for tests.
 */
export function logUnhandledError(
  entry: TopLevelEntry,
  error: unknown,
  id: string,
  log: (line: string) => void = console.error
): void {
  log(`[error] ${entry} ${JSON.stringify({ id, ...errorSummary(error) })}`);
}
