/**
 * What `mux renditions` and `we-moved` share (phase 8 rulings 5 and 15):
 * a throttle, a retry on 429 that honours `Retry-After`, and a ledger
 * file that makes a run resumable. Bun only.
 *
 * The clock and the sleep are injected, so the tests run without waiting.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { InputError } from "../core/inputs";

/** The process env, as the commands read it (credentials come from here). */
export type ProcessEnv = Readonly<Record<string, string | undefined>>;

/** The clock and the sleep the throttle and the retries use. */
export interface Timer {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const realTimer: Timer = {
  now: () => Date.now(),
  sleep: (ms) => Bun.sleep(ms),
};

/** The values of `names` in `env`; every missing one is named (never a value). */
export function requireEnv<const Names extends readonly string[]>(
  env: ProcessEnv,
  names: Names,
  why: string
): Record<Names[number], string> {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new InputError(
      `${missing.join(" and ")} must be set in the environment (${why}).`
    );
  }
  return Object.fromEntries(
    names.map((name) => [name, (env[name] ?? "").trim()])
  ) as Record<Names[number], string>;
}

/**
 * At most `perSecond` calls start per second: each `wait()` resolves at
 * least `1000 / perSecond` ms after the previous one did.
 */
export class Throttle {
  private next = 0;
  private readonly gapMs: number;
  private readonly timer: Timer;

  constructor(perSecond: number, timer: Timer) {
    this.gapMs = 1000 / perSecond;
    this.timer = timer;
  }

  async wait(): Promise<void> {
    const now = this.timer.now();
    if (now < this.next) {
      await this.timer.sleep(this.next - now);
    }
    this.next = Math.max(now, this.next) + this.gapMs;
  }
}

/** How often a 429 is waited out before the call fails. */
const RATE_LIMIT_RETRIES = 5;
/** The wait after a 429 without a readable `Retry-After`. */
const DEFAULT_RETRY_AFTER_SECONDS = 10;

/** A rate-limit answer: the seconds its `Retry-After` asks for, or null without one. */
export interface RateLimited {
  readonly retryAfterSeconds: number | null;
}

/**
 * Runs `call` after the throttle; when `rateLimited(error)` reads a 429,
 * waits its `Retry-After` (or `DEFAULT_RETRY_AFTER_SECONDS`) and tries
 * again, at most `RATE_LIMIT_RETRIES` times. Any other error is thrown.
 */
export async function throttled<T>(
  throttle: Throttle,
  timer: Timer,
  rateLimited: (error: unknown) => RateLimited | null,
  call: () => Promise<T>,
  onRetry?: (seconds: number) => void
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a retry waits for the call before it.
    await throttle.wait();
    try {
      return await call();
    } catch (error) {
      const limit = rateLimited(error);
      if (limit === null || attempt >= RATE_LIMIT_RETRIES) {
        throw error;
      }
      const seconds = limit.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
      onRetry?.(seconds);
      await timer.sleep(seconds * 1000);
    }
  }
}

/** A JSON object of `key → entry`, rewritten whole (write, then rename) after each change. */
export class Ledger<Entry> {
  readonly path: string;
  private readonly entries: Map<string, Entry>;

  private constructor(path: string, entries: Map<string, Entry>) {
    this.path = path;
    this.entries = entries;
  }

  /** The ledger at `path` (empty when there is none); a file that does not parse throws. */
  static open<T>(path: string, schema: z.ZodType<T>): Ledger<T> {
    if (!existsSync(path)) {
      return new Ledger<T>(path, new Map());
    }
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new InputError(`The ledger ${path} is not valid JSON.`, {
        cause: error,
      });
    }
    const parsed = z
      .object({
        entries: z.record(z.string(), schema),
        version: z.literal(1),
      })
      .safeParse(json);
    if (!parsed.success) {
      throw new InputError(
        `The ledger ${path} is not a ledger this command wrote; move it away to start over.`
      );
    }
    return new Ledger(path, new Map(Object.entries(parsed.data.entries)));
  }

  get(key: string): Entry | undefined {
    return this.entries.get(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Sets entries and writes the file. */
  record(updates: Iterable<readonly [string, Entry]>): void {
    for (const [key, entry] of updates) {
      this.entries.set(key, entry);
    }
    const sorted = Object.fromEntries(
      [...this.entries].sort(([a], [b]) => (a < b ? -1 : 1))
    );
    const temporary = `${this.path}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify({ entries: sorted, version: 1 }, null, 2)}\n`
    );
    renameSync(temporary, this.path);
  }
}
