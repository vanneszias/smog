/**
 * Vitest `setupFiles` entry for `@cloudflare/vitest-plugin` projects: applies
 * `migrations/*.sql` to the `DB` binding. The vitest config reads them with
 * `readD1Migrations()` and passes them as the `TEST_MIGRATIONS` binding.
 * Already-applied migrations are skipped, so this is safe per test file.
 *
 * It runs in a `beforeAll`, not as a top-level `await`: Vitest bounds a hook
 * with `hookTimeout`, but nothing bounds the import of a setup file, so a
 * stuck D1 call there would hang the file (and the run) with no error. A
 * setup file's hooks run before the test file's own.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
