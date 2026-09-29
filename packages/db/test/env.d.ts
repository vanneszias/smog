import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  // biome-ignore lint/style/noNamespace: merges into the `Cloudflare.Env` that `wrangler types` declares.
  namespace Cloudflare {
    interface Env {
      /** The seed SQL (`seed/dev.sql`), one statement per line. */
      SEED_SQL: string;
      /** `migrations/*.sql`, read by `readD1Migrations` in vitest.config.ts. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
