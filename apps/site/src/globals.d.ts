/** `false` in production builds: `/dev/*` pages are compiled out (vite.config.ts). */
declare const __SMOG_DEV_TOOLS__: boolean;

/** The CSP hash of the theme pre-paint script, base64 (build-defines.ts). */
declare const __SMOG_THEME_SCRIPT_HASH__: string;

/**
 * `true` only in a dev build (no `CLOUDFLARE_ENV`, or `dev`): the e2e seed
 * endpoint `/dev/e2e-seed` is compiled out of staging and production.
 */
declare const __SMOG_E2E_SEED__: boolean;
