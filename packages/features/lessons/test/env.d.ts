import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  // biome-ignore lint/style/noNamespace: merges into the `Cloudflare.Env` that `wrangler types` declares.
  namespace Cloudflare {
    interface Env {
      /** Real PNG and JPEG drawings and the engine's fonts and logo (`packages/pdf`), base64. */
      DRAWING_B64: string;
      DRAWING_JPG_B64: string;
      FONT_BOLD_B64: string;
      FONT_REGULAR_B64: string;
      LOGO_B64: string;
      /** `packages/db/migrations/*.sql`, read in vitest.config.ts. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
