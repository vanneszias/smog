import handler from "#open-next-worker";
import { type CronEnvironment, onScheduled } from "./src/jobs/cron";

/**
 * The Worker entry `wrangler.jsonc`'s `main` points at: OpenNext's generated
 * `fetch`, plus the hourly `scheduled()` that drains the job queue. The
 * pattern is OpenNext's own (https://opennext.js.org/cloudflare/howtos/custom-worker).
 * No Durable Object classes are re-exported because this app binds none; add
 * them here if `open-next.config.ts` ever enables the DO queue or tag cache.
 *
 * The tick is dispatched into this Worker's own `fetch`, in-process, so it
 * runs through the same middleware and Payload instance as any request.
 *
 * `#open-next-worker` (`package.json`'s `imports` map), not a relative
 * `./.open-next/worker.js`: `.open-next/worker.js` does not exist in a fresh
 * checkout, and once a build has produced it, it is real JavaScript pulling
 * in Next's whole bundled server — see `open-next-worker.d.ts` for why a
 * plain relative import there once broke `check-types` after a build
 * (Review Focus 5) and why this subpath, resolving to that same `.d.ts` file
 * for TypeScript and to the real `./.open-next/worker.js` for esbuild
 * (wrangler's bundler, which has no `types` condition), does not.
 *
 * `ExportedHandler<CloudflareEnv & CronEnvironment>` rather than plain
 * `CloudflareEnv`: `wrangler types` never emits `JOBS_RUN_TOKEN`, a secret,
 * so `env` needs `CronEnvironment` intersected in for `onScheduled` to type
 * check against something more than an empty overlap. See the doc comment on
 * `CronEnvironment` in `src/jobs/cron.ts`.
 */
export default {
  fetch: handler.fetch,
  scheduled(_controller, env, ctx) {
    onScheduled(env, ctx, (request) => handler.fetch(request, env, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv & CronEnvironment>;
