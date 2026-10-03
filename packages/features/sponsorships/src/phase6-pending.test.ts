/**
 * Review I-6 of phase 6 task 8: the sponsor e2e skips its checkout and
 * re-edit tests while the task 3 stubs stand (`PHASE6_PENDING` in
 * `apps/site/e2e/phase6.ts`). Once `docs/PROGRESS.md` marks phase 6 done,
 * no stub (`notImplemented(`) and no pending flag may remain, so no e2e
 * test stays skipped for good. Task 9 removes both.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const SERVER = join(import.meta.dir, "server");
const PENDING_FILE = join(ROOT, "apps", "site", "e2e", "phase6.ts");
const PROGRESS = join(ROOT, "docs", "PROGRESS.md");

const PHASE6_DONE = /^- Phase 6: done\b/m;
/** A call of the stub helper, not its definition. */
const STUB_CALL = /(?<!function )\bnotImplemented\(/;

interface Phase6State {
  pendingFile: string | null;
  progress: string;
  /** Server source files by name. */
  server: Readonly<Record<string, string>>;
}

/** What must go before phase 6 is done: an empty list when nothing. */
function phase6Leftovers(state: Phase6State): string[] {
  if (!PHASE6_DONE.test(state.progress)) {
    return [];
  }
  const leftovers = Object.entries(state.server)
    .filter(([, source]) => STUB_CALL.test(source))
    .map(([name]) => `notImplemented( in server/${name}`);
  if (state.pendingFile?.includes("PHASE6_PENDING")) {
    leftovers.push("PHASE6_PENDING in apps/site/e2e/phase6.ts");
  }
  return leftovers;
}

const STUB = "export const checkout = () => notImplemented();";

describe("phase 6 leaves no e2e skipped for good (review I-6)", () => {
  test("the detector: quiet until phase 6 is done, then names every leftover", () => {
    const open = {
      pendingFile: "export const PHASE6_PENDING = {}",
      progress: "- Phase 5: done.\n",
      server: { "checkout.ts": STUB },
    };
    expect(phase6Leftovers(open)).toEqual([]);
    const done = { ...open, progress: "- Phase 6: done once …\n" };
    expect(phase6Leftovers(done)).toEqual([
      "notImplemented( in server/checkout.ts",
      "PHASE6_PENDING in apps/site/e2e/phase6.ts",
    ]);
    expect(
      phase6Leftovers({
        pendingFile: null,
        progress: done.progress,
        server: {
          "procedure.ts":
            "export function notImplemented(): never { throw 1; }",
        },
      })
    ).toEqual([]);
  });

  test("the repository", () => {
    const server = Object.fromEntries(
      readdirSync(SERVER)
        .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
        .map((name) => [name, readFileSync(join(SERVER, name), "utf8")])
    );
    expect(
      phase6Leftovers({
        pendingFile: existsSync(PENDING_FILE)
          ? readFileSync(PENDING_FILE, "utf8")
          : null,
        progress: readFileSync(PROGRESS, "utf8"),
        server,
      })
    ).toEqual([]);
  });
});
