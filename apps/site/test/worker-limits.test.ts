import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/*
 * Phase 9 task 6, Worker limits (ruling 2: no tight wall-clock assertion).
 * The bundle's size is held by the deploy guard (`perf-budget.json`: the
 * Worker's gzip cap). Here the first requests are timed and logged, with a
 * generous order-of-magnitude ceiling: a Worker whose first request takes
 * 2 s on a local D1 has a start-up problem, a slow machine does not.
 */

const ORIGIN = "http://localhost:5173";
const CEILING_MS = 2000;

async function timed(path: string): Promise<number> {
  const start = performance.now();
  const response = await exports.default.fetch(`${ORIGIN}${path}`);
  await response.text();
  expect(response.status).toBe(200);
  return performance.now() - start;
}

describe("the Worker's first requests", () => {
  it("answers the health check and a server-rendered catalogue page well inside 2 s", async () => {
    const health = await timed("/api/health");
    const catalogue = await timed("/gestures");
    const again = await timed("/gestures");
    // Noted in the task report; the numbers vary with the machine.
    console.log(
      `[perf] first request ${health.toFixed(0)} ms, /gestures ${catalogue.toFixed(0)} ms, again ${again.toFixed(0)} ms (workerd, local D1)`
    );
    expect(health).toBeLessThan(CEILING_MS);
    expect(catalogue).toBeLessThan(CEILING_MS);
    expect(again).toBeLessThan(CEILING_MS);
  });
});
