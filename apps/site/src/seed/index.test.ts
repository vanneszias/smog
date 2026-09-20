import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import { runSeed } from ".";

/**
 * Importing `.` here is itself part of the test. If `index.ts` ever imports
 * `payload.config` statically, that import is hoisted and evaluated at
 * module load — resolving the Cloudflare bindings *before* any guard in a
 * function body can refuse — and this jsdom-environment file would blow up on
 * the import alone.
 */

const local = { CLOUDFLARE_ENV: "staging" };

const noop = () => {
  // Nothing under test reads the log output.
};

describe("runSeed", () => {
  it("refuses a non-local target before Payload is ever loaded", async () => {
    const loadPayload = vi.fn();

    await expect(
      runSeed({
        env: { CLOUDFLARE_ENV: "production" },
        loadPayload,
        log: noop,
      })
    ).rejects.toThrow(/CLOUDFLARE_ENV/);

    expect(loadPayload).not.toHaveBeenCalled();
  });

  it("refuses NODE_ENV=production before Payload is ever loaded", async () => {
    const loadPayload = vi.fn();

    await expect(
      runSeed({
        env: { ...local, NODE_ENV: "production" },
        loadPayload,
        log: noop,
      })
    ).rejects.toThrow(/NODE_ENV/);

    expect(loadPayload).not.toHaveBeenCalled();
  });

  it("loads Payload once the target is local", async () => {
    const loadPayload = vi.fn(
      (): Promise<Payload> =>
        Promise.reject(new Error("payload would have been loaded here"))
    );

    await expect(
      runSeed({ env: local, loadPayload, log: noop })
    ).rejects.toThrow("payload would have been loaded here");

    expect(loadPayload).toHaveBeenCalledTimes(1);
  });
});
