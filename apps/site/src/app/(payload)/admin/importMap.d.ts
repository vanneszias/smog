import type { ImportMap } from "payload";

/**
 * Types for the sibling `importMap.js`, which `payload generate:importmap`
 * regenerates as plain JavaScript (its own `@type` JSDoc comment names the
 * same `payload` `ImportMap` type this restates).
 *
 * This file exists so `tsconfig.json`'s `allowJs` can stay `false`: this
 * package's one deliberately-plain-JS source file is otherwise the one
 * import in the whole app that would need it, and turning `allowJs` on for
 * that reason is what let `worker.ts`'s `.open-next/worker.js` import — real
 * only after a build — get fully parsed as JavaScript once built, which is
 * how a vendor bundle nested under it broke `check-types` (Review Focus 5;
 * see `worker.ts`'s and `open-next-worker.d.ts`'s doc comments for the
 * chain). With `allowJs` off, that import falls back to
 * `open-next-worker.d.ts`'s ambient declaration in both states instead of
 * ever being parsed as real JavaScript.
 */
export declare const importMap: ImportMap;
