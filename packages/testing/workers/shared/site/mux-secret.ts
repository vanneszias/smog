/**
 * The site tests' Mux webhook signing secret: `vitest.config.ts` binds it
 * as `MUX_WEBHOOK_SECRET` (the only secret besides the auth one), and
 * `mux-webhook.test.ts` signs with it.
 */
export const MUX_WEBHOOK_TEST_SECRET = "site-test-mux-webhook-secret";
