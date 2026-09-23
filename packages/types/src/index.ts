/**
 * @fileoverview @smog/types — Shared domain types for the SMOG monorepo
 *
 * The render contract lives at `@smog/types/render` (see `render.ts`); the
 * package root carries the sponsor overlay configuration.
 *
 * @example
 * import type { OverlayConfig } from "@smog/types";
 */

export type { OverlayConfig } from "./overlay";
export { DEFAULT_OVERLAY_CONFIG } from "./overlay";
