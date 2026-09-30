import { createHash } from "node:crypto";
import { SYSTEM_THEME_SCRIPT } from "./src/lib/preferences";

/**
 * Build-time constants shared by vite.config.ts and vitest.config.ts.
 *
 * `__SMOG_THEME_SCRIPT_HASH__`: the CSP `sha256-` source of the theme
 * pre-paint script, hashed from the same string the root document inlines
 * (`SYSTEM_THEME_SCRIPT`), so the two cannot drift (`src/worker/headers.ts`;
 * `test/security-headers.test.ts` hashes the served page's script again).
 */
export const THEME_SCRIPT_HASH_DEFINE = JSON.stringify(
  createHash("sha256").update(SYSTEM_THEME_SCRIPT).digest("base64")
);
