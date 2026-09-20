// Load .env files first, so a developer's real values win over the defaults below.
import "dotenv/config";

/**
 * Test-only defaults for the two variables payload.config.ts demands at import.
 *
 * Without these, every test that imports the config is skipped rather than run —
 * including the locale-configuration guards, whose entire purpose is to fail when
 * someone deletes the `localization` block. `release:check` runs `bun run test`
 * with no secrets, so those guards were skipping silently in CI: a test that looks
 * like a safety net and catches nothing.
 *
 * Neither value is sensitive. Nothing in the test suite signs a token or reaches a
 * remote environment: PAYLOAD_SECRET only has to be non-empty, and CLOUDFLARE_ENV
 * only selects which named wrangler environment's bindings to emulate locally.
 * Real values, when present in the environment, are left untouched.
 */
process.env.PAYLOAD_SECRET ||= "test-only-secret-not-used-for-signing";
process.env.CLOUDFLARE_ENV ||= "staging";

/**
 * React 19 requires this flag before `act` will run, and warns loudly without
 * it. It lives here rather than in each test file because it is a property of
 * the runner, not of any one component — and because a file that forgot it
 * would still typecheck, since one file's `declare global` covers the whole
 * program.
 */
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
