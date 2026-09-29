/**
 * Vitest `setupFiles` entry for `@cloudflare/vitest-plugin` projects: applies
 * `migrations/*.sql` to the `DB` binding. The vitest config reads them with
 * `readD1Migrations()` and passes them as the `TEST_MIGRATIONS` binding.
 * Already-applied migrations are skipped, so this is safe per test file.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
