import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  // biome-ignore lint/style/noNamespace: merges into the `Cloudflare.Env` that `wrangler types` declares.
  namespace Cloudflare {
    interface Env {
      /** `packages/db/migrations/*.sql`, read in vitest.config.ts. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
