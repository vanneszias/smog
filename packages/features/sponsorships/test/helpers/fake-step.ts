/**
 * A fake `RenderStep` (phase 7 ruling 15): `runRenderJob` runs in the
 * Workers pool without a Workflow. It mirrors the engine where the render
 * relies on it:
 * - every `do` needs an explicit config (retries with limit, delay and
 *   backoff, and a timeout), and its attempts follow `retries.limit`; a
 *   non-retryable `RenderJobFailure` is not retried (the site's adapter
 *   makes it a `NonRetryableError`); an attempt past `timeout` fails;
 * - a step that completed is not run again when the same fake replays the
 *   Workflow (the engine's cached results), nor is one that failed;
 * - `loseResult(name)` runs the step's work and then fails the attempt, as
 *   a step whose result never reached the engine ("commit then throw");
 * - `forceTimeout(name)` fails attempts as timed out without running them;
 * - sleeps are skipped (and recorded; `onSleep` runs at each);
 * - `waitForEvent` takes the first buffered event of its type (an event
 *   sent before the wait is kept, as the engine does), or calls `onWait`
 *   and looks again, or times out (`null`).
 * It records every call with its name, config, attempts and output.
 */

import { z } from "zod";
import type {
  RenderStep,
  RenderStepConfig,
} from "../../src/server/render-workflow";
import { toRenderJobFailure } from "../../src/server/render-workflow";

interface FakeStepCall {
  attempts?: number;
  config?: RenderStepConfig;
  kind: "do" | "sleep" | "wait";
  name: string;
  output?: unknown;
  timeoutMs?: number;
  type?: string;
}

export interface FakeStep extends RenderStep {
  readonly calls: FakeStepCall[];
  forceTimeout: (name: string, times?: number) => void;
  loseResult: (name: string, times?: number) => void;
  /** Every `do` name that ran, in order (cached replays excluded). */
  names: () => string[];
  /** Runs at each sleep, before it "passes" (the test moves the world on). */
  onSleep: ((name: string) => Promise<void> | void) | null;
  /** Runs when a wait finds no buffered event; it may `sendEvent`. */
  onWait: ((type: string) => Promise<void> | void) | null;
  /** Every recorded step output, in order. */
  outputs: () => unknown[];
  sendEvent: (type: string, payload: unknown) => void;
}

/** A step result that never reached the engine. */
class LostStepResult extends Error {
  constructor(name: string) {
    super(`[fake-step] The result of ${name} was lost`);
    this.name = "LostStepResult";
  }
}

class StepTimeout extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`[fake-step] ${name} timed out after ${timeoutMs} ms`);
    this.name = "WorkflowTimeoutError";
  }
}

/** A config the engine would take without falling back to its defaults. */
const explicitConfig = z.object({
  retries: z.object({
    backoff: z.enum(["constant", "exponential", "linear"]),
    delay: z.number().nonnegative(),
    limit: z.number().int().nonnegative(),
  }),
  timeout: z.number().positive(),
});

function assertExplicit(name: string, config: unknown): void {
  if (!explicitConfig.safeParse(config).success) {
    throw new Error(`[fake-step] ${name} has no explicit config`);
  }
}

function takeOne(counts: Map<string, number>, name: string): boolean {
  const left = counts.get(name) ?? 0;
  if (left <= 0) {
    return false;
  }
  counts.set(name, left - 1);
  return true;
}

async function withTimeout<T>(
  name: string,
  timeoutMs: number,
  work: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new StepTimeout(name, timeoutMs)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createFakeStep(): FakeStep {
  const calls: FakeStepCall[] = [];
  const results = new Map<string, { error?: unknown; value?: unknown }>();
  const lose = new Map<string, number>();
  const timeouts = new Map<string, number>();
  const events = new Map<string, unknown[]>();

  /** One attempt: forced timeout, the work within its timeout, a lost result. */
  async function attempt<T>(
    name: string,
    config: RenderStepConfig,
    fn: () => Promise<T>
  ): Promise<T> {
    if (takeOne(timeouts, name)) {
      throw new StepTimeout(name, config.timeout);
    }
    const value = await withTimeout(name, config.timeout, fn);
    if (takeOne(lose, name)) {
      throw new LostStepResult(name);
    }
    // The engine stores results as JSON-like values.
    return value === undefined ? value : structuredClone(value);
  }

  /** The attempts `retries.limit` allows; a non-retryable failure stops them. */
  async function attempts<T>(
    name: string,
    config: RenderStepConfig,
    fn: () => Promise<T>,
    call: FakeStepCall
  ): Promise<T> {
    for (;;) {
      call.attempts = (call.attempts ?? 0) + 1;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: attempts are sequential.
        const value = await attempt(name, config, fn);
        call.output = value;
        return value;
      } catch (error) {
        const failure = toRenderJobFailure(error);
        if (
          (failure && !failure.retryable) ||
          call.attempts > config.retries.limit
        ) {
          throw error;
        }
      }
    }
  }

  function takeEvent(type: string): { payload: unknown } | null {
    const queue = events.get(type) ?? [];
    if (queue.length === 0) {
      return null;
    }
    return { payload: queue.shift() };
  }

  const step: FakeStep = {
    calls,
    async do<T>(
      name: string,
      config: RenderStepConfig,
      fn: () => Promise<T>
    ): Promise<T> {
      assertExplicit(name, config);
      const cached = results.get(name);
      if (cached) {
        if ("error" in cached) {
          throw cached.error;
        }
        return cached.value as T;
      }
      const call: FakeStepCall = { attempts: 0, config, kind: "do", name };
      calls.push(call);
      try {
        const value = await attempts(name, config, fn, call);
        results.set(name, { value });
        return value;
      } catch (error) {
        results.set(name, { error });
        throw error;
      }
    },
    forceTimeout: (name, times = 1) => {
      timeouts.set(name, (timeouts.get(name) ?? 0) + times);
    },
    loseResult: (name, times = 1) => {
      lose.set(name, (lose.get(name) ?? 0) + times);
    },
    names: () =>
      calls.filter((call) => call.kind === "do").map((call) => call.name),
    onSleep: null,
    onWait: null,
    outputs: () =>
      calls.filter((call) => "output" in call).map((call) => call.output),
    sendEvent: (type, payload) => {
      events.set(type, [...(events.get(type) ?? []), payload]);
    },
    async sleep(name: string, durationMs: number): Promise<void> {
      if (results.has(name)) {
        return;
      }
      calls.push({ kind: "sleep", name, timeoutMs: durationMs });
      await step.onSleep?.(name);
      results.set(name, { value: null });
    },
    async waitForEvent<T>(
      name: string,
      options: { timeoutMs: number; type: string }
    ): Promise<T | null> {
      const cached = results.get(name);
      if (cached) {
        return cached.value as T | null;
      }
      const call: FakeStepCall = {
        kind: "wait",
        name,
        timeoutMs: options.timeoutMs,
        type: options.type,
      };
      calls.push(call);
      let event = takeEvent(options.type);
      if (!event && step.onWait) {
        await step.onWait(options.type);
        event = takeEvent(options.type);
      }
      const value = (event?.payload ?? null) as T | null;
      call.output = value;
      results.set(name, { value });
      return value;
    },
  };
  return step;
}
