/**
 * @fileoverview Main entry point for @smog/config runtime exports.
 *
 * Re-exports all constants and URLs for convenient single-import access.
 *
 * Note: The `tsconfig.base.json` shared TypeScript configuration is consumed
 * separately via the `@smog/config/tsconfig.base.json` path in `extends`.
 *
 * @example
 * import { VIDEO_COMPLETE_COUNT, COURSE_URL } from "@smog/config";
 */

export * from "./constants";
export * from "./urls";
