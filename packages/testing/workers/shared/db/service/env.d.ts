import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  // biome-ignore lint/style/noNamespace: merges into the `Cloudflare.Env` that `wrangler types` declares.
  namespace Cloudflare {
    interface Env {
      /**
       * The dev seed frozen at migration 0014 (`test/fixtures/seed-0014.sql`):
       * the migration tests that stop before 0015 apply it to the old schema.
       */
      LEGACY_SEED_SQL: string;
      /** The seed SQL (`seed/dev.sql`), one statement per line. */
      SEED_SQL: string;
      /** `migrations/*.sql`, read by `readD1Migrations` in vitest.config.ts. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
