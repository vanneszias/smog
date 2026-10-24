import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const SUFFIX = "?bytes";
const PREFIX = "\0smog-bytes:";

/**
 * `import data from "<file>?bytes"`: the file's bytes as a `Uint8Array`,
 * embedded in the module (phase 10c task 5b: the PDF fonts and logo, about
 * 115 kB as base64). No `wrangler.jsonc` rule is involved, so the built
 * config does not change, and the module is only ever imported dynamically
 * by the export route, so it is its own chunk, never part of the Worker's
 * startup and never reachable from a client entry (the deploy guard checks
 * that). Shared by vite.config.ts and vitest.config.ts.
 */
export function bytesModules(): Plugin {
  return {
    enforce: "pre",
    load(id) {
      if (!id.startsWith(PREFIX)) {
        return null;
      }
      const file = id.slice(PREFIX.length);
      this.addWatchFile(file);
      const base64 = readFileSync(file).toString("base64");
      return [
        `const text = atob(${JSON.stringify(base64)});`,
        "const bytes = new Uint8Array(text.length);",
        "for (let at = 0; at < text.length; at += 1) { bytes[at] = text.charCodeAt(at); }",
        "export default bytes;",
      ].join("\n");
    },
    name: "smog:bytes-modules",
    async resolveId(source, importer, options) {
      if (!source.endsWith(SUFFIX)) {
        return null;
      }
      const resolved = await this.resolve(
        source.slice(0, -SUFFIX.length),
        importer,
        { ...options, skipSelf: true }
      );
      return resolved ? `${PREFIX}${resolved.id}` : null;
    },
  };
}
