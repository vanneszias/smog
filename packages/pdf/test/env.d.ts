declare global {
  // biome-ignore lint/style/noNamespace: merges into the `Cloudflare.Env` that `wrangler types` declares.
  namespace Cloudflare {
    interface Env {
      /** A drawing fixture PNG, base64. */
      DRAWING_B64: string;
      /** Figtree Bold, base64 (read in vitest.config.ts). */
      FONT_BOLD_B64: string;
      /** Figtree Regular, base64. */
      FONT_REGULAR_B64: string;
      /** The brand icon PNG (1024 px, RGBA), base64. */
      IMAGE_B64: string;
      /** The bundled 256 px logo PNG, base64. */
      LOGO_B64: string;
    }
  }
}

export {};
