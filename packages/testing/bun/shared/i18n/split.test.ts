import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LAZY_ENTRY = fileURLToPath(
  new URL("../../../../i18n/src/index.lazy.ts", import.meta.url)
);
const FULL_ENTRY = fileURLToPath(
  new URL("../../../../i18n/src/index.ts", import.meta.url)
);

/** One string of the Dutch and of the French catalogue that the other does not contain. */
const NL_MARKER = /\bAnnuleren\b/;
const FR_MARKER = /\bAnnuler\b/;

/** `bun build` of `entry` with chunk splitting: the entry file's text and the other chunks' texts. */
function bundle(entry: string): { entryText: string; rest: string[] } {
  const outdir = mkdtempSync(join(tmpdir(), "smog-i18n-split-"));
  try {
    const run = Bun.spawnSync([
      "bun",
      "build",
      entry,
      "--target=browser",
      "--splitting",
      "--external=i18next",
      "--external=react-i18next",
      `--outdir=${outdir}`,
    ]);
    expect(run.exitCode).toBe(0);
    const files = readdirSync(outdir).filter((name) => name.endsWith(".js"));
    const texts = new Map(
      files.map((name) => [name, readFileSync(join(outdir, name), "utf8")])
    );
    const entryText = texts.get("index.js") ?? texts.get("index.lazy.js") ?? "";
    return {
      entryText,
      rest: [...texts.values()].filter((text) => text !== entryText),
    };
  } finally {
    rmSync(outdir, { force: true, recursive: true });
  }
}

describe("the per-locale catalogue split (phase 10b task 7b)", () => {
  test("the lazy entry holds no catalogue; each language is a chunk of its own", () => {
    const { entryText, rest } = bundle(LAZY_ENTRY);
    expect(entryText).not.toMatch(NL_MARKER);
    expect(entryText).not.toMatch(FR_MARKER);
    expect(rest.filter((text) => NL_MARKER.test(text))).toHaveLength(1);
    expect(rest.filter((text) => FR_MARKER.test(text))).toHaveLength(1);
  });

  test("the full entry carries all three (the Worker, tests and the mobile app)", () => {
    // The shipped module imports each catalogue statically (the bundler may
    // still put the data in a shared chunk next to the entry).
    const { entryText } = bundle(FULL_ENTRY);
    expect(entryText.match(/translation: \w+_default/g)).toHaveLength(3);
  });

  test("without a shipped import a language is empty until it is loaded", () => {
    const script = `
      import { createI18n, ensureCatalogues } from ${JSON.stringify(LAZY_ENTRY)};
      const before = createI18n("fr").t("common.cancel");
      await ensureCatalogues("fr");
      const after = createI18n("fr").t("common.cancel");
      // An overlay-only language also needs the default one for its fallback.
      await ensureCatalogues("de");
      const de = createI18n("de").t("common.cancel");
      console.log(JSON.stringify({ after, before, de }));
    `;
    const run = Bun.spawnSync(["bun", "-e", script]);
    expect(run.exitCode).toBe(0);
    const out = JSON.parse(run.stdout.toString().trim()) as Record<
      string,
      string
    >;
    expect(out.before).toBe("common.cancel");
    expect(out.after).toBe("Annuler");
    expect(out.de).toBe("Annuleren");
  });
});
