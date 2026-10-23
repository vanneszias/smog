// biome-ignore-all lint/performance/noBarrelFile: the package's public entry point
// Everything, with all three shipped catalogues registered at once: the
// Worker, the tests, the scripts and the mobile app. The site's browser
// build resolves `@smog/i18n` to `./index.lazy.ts` instead (one language in
// the entry, the others loaded on demand; apps/site/vite.config.ts).
export * from "./index.lazy";
export { resources } from "./shipped";
