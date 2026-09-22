import { describe, expect, it, vi } from "vitest";
import { onScheduled, runScheduledTick } from "@/jobs/cron";

/**
 * The tick a Cron Trigger's `scheduled()` handler makes.
 *
 * A unit test with no Worker, because there is no Worker to have: OpenNext
 * generates the entry module and it exports only `fetch`, so the handler this
 * is half of does not exist yet and Task 7 owns it. `jobs/cron.ts` says why at
 * length. What can be asserted without a deploy is the request — the path it
 * is aimed at, the header it carries, and what it does when the two things it
 * needs are missing.
 */
describe("the scheduled tick", () => {
  const environment = {
    JOBS_RUN_TOKEN: "cron-test-token",
    SITE_ORIGIN: "https://smog.example",
  };

  const ok = () => Promise.resolve(Response.json({ status: "ok" }));

  it("asks the run endpoint for a run, carrying the shared secret", async () => {
    let seen: null | Request = null;

    await runScheduledTick(environment, (request) => {
      seen = request;

      return ok();
    });

    const sent = seen as null | Request;

    expect(sent?.url).toBe("https://smog.example/api/jobs/run");
    expect(sent?.method).toBe("GET");
    expect(sent?.headers.get("authorization")).toBe("Bearer cron-test-token");
  });

  it("builds the request on the configured origin, not on a guess", async () => {
    /*
     * Not cosmetic. `endpoints/jobs.ts` hands its own request to
     * `payload.jobs.run`, and `send-renewal-reminders` builds the renewal link
     * in every message out of `req.origin` — so the host named here is the
     * host in a sponsor's inbox.
     */
    let seen = "";

    await runScheduledTick(
      { ...environment, SITE_ORIGIN: "https://smog-staging.example" },
      (request) => {
        seen = request.url;

        return ok();
      }
    );

    expect(seen).toBe("https://smog-staging.example/api/jobs/run");
  });

  it("refuses to tick with no token, rather than ticking without one", async () => {
    /*
     * The endpoint answers every caller the same bytes, so a tick that sent no
     * token would be indistinguishable from a tick that worked — for ever, with
     * nobody watching. It has to fail where a scheduled invocation's failure is
     * read, which is the Worker's own log.
     */
    let called = false;
    const dispatch = () => {
      called = true;

      return ok();
    };

    await expect(
      runScheduledTick({ SITE_ORIGIN: environment.SITE_ORIGIN }, dispatch)
    ).rejects.toThrow(/JOBS_RUN_TOKEN/);

    // An empty string is what an unset Worker secret looks like to a binding
    // that was declared and never given a value.
    await expect(
      runScheduledTick({ ...environment, JOBS_RUN_TOKEN: "  " }, dispatch)
    ).rejects.toThrow(/JOBS_RUN_TOKEN/);

    expect(called).toBe(false);
  });

  it("refuses to tick with no origin", async () => {
    let called = false;
    const dispatch = () => {
      called = true;

      return ok();
    };

    await expect(
      runScheduledTick({ JOBS_RUN_TOKEN: environment.JOBS_RUN_TOKEN }, dispatch)
    ).rejects.toThrow(/SITE_ORIGIN/);

    expect(called).toBe(false);

    // The positive beside the negatives: with both present it does tick, so
    // these are refusals rather than a function that never works.
    await runScheduledTick(environment, dispatch);

    expect(called).toBe(true);
  });
});

describe("onScheduled", () => {
  const environment = {
    JOBS_RUN_TOKEN: "cron-test-token",
    SITE_ORIGIN: "https://smog.example",
  };

  const capture = () => {
    const held: Promise<unknown>[] = [];
    return {
      held,
      context: { waitUntil: (p: Promise<unknown>) => held.push(p) },
    };
  };

  it("holds the run open with waitUntil and dispatches the authenticated tick", async () => {
    const { held, context } = capture();
    // Typed with its `Request` parameter (rather than the brief's `() => …`)
    // so `dispatch.mock.calls[0]` is `[Request]` on its own: this workspace's
    // global `Request` is workers-types', and casting a zero-arg mock's `[]`
    // call tuple to `[Request]` is a `TS2352` "insufficient overlap" under
    // `strict`, not a cast TypeScript allows here.
    const dispatch = vi.fn((_request: Request) =>
      Promise.resolve(Response.json({ status: "ok" }))
    );

    onScheduled(environment, context, dispatch);

    expect(held).toHaveLength(1);
    await held[0];
    const [request] = dispatch.mock.calls[0];
    expect(request.url).toBe("https://smog.example/api/jobs/run");
    expect(request.headers.get("authorization")).toBe("Bearer cron-test-token");
  });

  it("logs a refused tick with its status instead of passing it off as a run (Review Focus 1)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { held, context } = capture();

    onScheduled(environment, context, () =>
      Promise.resolve(new Response(null, { status: 401 }))
    );
    await held[0];

    expect(error).toHaveBeenCalledWith(expect.stringContaining("401"));
    error.mockRestore();
  });

  it("logs a missing variable and does not reject (Review Focus 2)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { held, context } = capture();
    const dispatch = vi.fn();

    onScheduled({ JOBS_RUN_TOKEN: "t" }, context, dispatch);

    await expect(held[0]).resolves.toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[cron] Scheduled job run failed:",
      expect.objectContaining({
        message: expect.stringContaining("SITE_ORIGIN"),
      })
    );
    error.mockRestore();
  });

  it("logs a dispatch that throws and does not reject", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { held, context } = capture();

    onScheduled(environment, context, () => Promise.reject(new Error("boom")));

    await expect(held[0]).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "[cron] Scheduled job run failed:",
      expect.any(Error)
    );
    error.mockRestore();
  });
});
