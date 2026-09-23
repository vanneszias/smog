import { describe, expect, it, vi } from "vitest";
import { onScheduled, runScheduledTick } from "@/jobs/cron";

/**
 * The tick a Cron Trigger's `scheduled()` handler makes.
 *
 * A unit test against `runScheduledTick` and `onScheduled` directly rather
 * than against the deployed handler: the actual `scheduled()` is `worker.ts`,
 * at the package root, and its own import (of OpenNext's build output) only
 * resolves after a build, so it cannot be unit tested against a tree with no
 * build the way this file is. `jobs/cron.ts` says more. What's asserted here
 * is the request — the path it is aimed at, the headers it carries, and what
 * happens when the two things it needs are missing — and, below, that
 * `onScheduled` holds the tick open, logs what happened, and rethrows so the
 * held promise rejects — the failure a Cron Trigger's Past Events table
 * records.
 */
describe("the scheduled tick", () => {
  const environment = {
    JOBS_RUN_TOKEN: "cron-test-token",
    SITE_ORIGIN: "https://smog.example",
  };

  const ok = () => Promise.resolve(Response.json({ status: "ok" }));

  it("asks the run endpoint for a run, carrying the shared secret", async () => {
    /*
     * `host` is not decoration. OpenNext's edge converter rebuilds the
     * dispatched request from `x-forwarded-host`, which it reads off
     * `Request`'s own `host` header (`@opennextjs/aws`'s
     * `overrides/converters/edge.js`), Next then builds `initURL` from that
     * header (falling back to `localhost` if it's missing), and Payload's
     * `createPayloadRequest` sets `req.origin` from `initURL` — so a tick
     * with no `host` header reaches `send-renewal-reminders` as
     * `https://undefined` or `https://localhost`, not `SITE_ORIGIN`.
     */
    let seen: null | Request = null;

    await runScheduledTick(environment, (request) => {
      seen = request;

      return ok();
    });

    const sent = seen as null | Request;

    expect(sent?.url).toBe("https://smog.example/api/jobs/run");
    expect(sent?.method).toBe("GET");
    expect(sent?.headers.get("authorization")).toBe("Bearer cron-test-token");
    expect(sent?.headers.get("host")).toBe("smog.example");
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

  it("logs a refused tick with its status, then rejects, so Cron Trigger Past Events records the failure (Review Focus 1)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { held, context } = capture();

    onScheduled(environment, context, () =>
      Promise.resolve(new Response(null, { status: 401 }))
    );

    await expect(held[0]).rejects.toThrow(/401/);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("401"));
    error.mockRestore();
  });

  it("logs a missing variable, then rejects (Review Focus 2)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { held, context } = capture();
    const dispatch = vi.fn();

    onScheduled({ JOBS_RUN_TOKEN: "t" }, context, dispatch);

    await expect(held[0]).rejects.toThrow(/SITE_ORIGIN/);
    expect(dispatch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[cron] Scheduled job run failed:",
      expect.objectContaining({
        message: expect.stringContaining("SITE_ORIGIN"),
      })
    );
    error.mockRestore();
  });

  it("logs a dispatch that throws, then rejects", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { held, context } = capture();

    onScheduled(environment, context, () => Promise.reject(new Error("boom")));

    await expect(held[0]).rejects.toThrow("boom");
    expect(error).toHaveBeenCalledWith(
      "[cron] Scheduled job run failed:",
      expect.any(Error)
    );
    error.mockRestore();
  });
});
