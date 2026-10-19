/**
 * Every console line of the render server is URL-free (review I-1).
 * Remotion's own logger (`Log.warn`/`Log.error` in `@remotion/renderer`)
 * ends in `console.*` and names the signed source URL ("Downloading <url>
 * failed (will retry)", the failed resource's proxy URL, compositor
 * errors), bypassing `RenderLog`. `main.ts` calls `scrubConsole()` first,
 * so every string goes through `scrubUrls` and every `Error` through
 * `describeError` (its name and message, never its cause).
 */
import { describeError, scrubUrls } from "./errors";

const METHODS = ["debug", "error", "info", "log", "warn"] as const;

type ConsoleLike = Record<
  (typeof METHODS)[number],
  (...args: unknown[]) => void
>;

function scrubArgument(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubUrls(value);
  }
  if (value instanceof Error) {
    return describeError(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  return scrubUrls(Bun.inspect(value));
}

/** Wraps the console methods of `target` (the global console by default). */
export function scrubConsole(target: ConsoleLike = console): void {
  for (const method of METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]): void => {
      original(...args.map(scrubArgument));
    };
  }
}
