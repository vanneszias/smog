/**
 * `@smog/migrate-convex` core: the Convex → D1 mapping as pure TypeScript
 * (phase 8 ruling 6). It runs under `bun test` and in workerd, so it uses
 * no `Bun.*`, `node:*` or `cloudflare:*`, and imports only `@smog/config`,
 * `@smog/utils`, `@smog/db`, a feature's `./schema`, `zod` and
 * `drizzle-orm` (`test/core-rules.test.ts`). Everything that touches the
 * file system, wrangler or a network lives in `src/cli`.
 *
 * The export schemas, ids, pseudonymiser, transforms, report and SQL
 * emitter arrive with phase 8 tasks 5, 7, 8 and 10.
 */
export {};
