/**
 * @fileoverview Main entry point for @smog/config runtime exports.
 *
 * Re-exports the constants and sponsorship statuses for single-import access.
 *
 * Note: The `tsconfig.base.json` shared TypeScript configuration is consumed
 * separately via the `@smog/config/tsconfig.base.json` path in `extends`.
 *
 * @example
 * import { MAX_GESTURES_PER_SPONSORSHIP, SPONSORSHIP_STATUSES } from "@smog/config";
 */

export * from "./constants";
export * from "./sponsorships";
