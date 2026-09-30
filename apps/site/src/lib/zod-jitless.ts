import { config } from "zod";

/**
 * Zod compiles object parsers with `new Function` after probing whether
 * eval works. The CSP has no 'unsafe-eval', so the probe (caught by Zod)
 * still shows up as a CSP violation in the browser. Zod reads the flag when
 * each object schema is built, so this module must run before any schema
 * module: `src/router.tsx` imports it first. The Worker disallows eval too.
 */
config({ jitless: true });
