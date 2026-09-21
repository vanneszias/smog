import { describe, expect, it } from "vitest";
import { runScheduledTick } from "@/jobs/cron";

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
