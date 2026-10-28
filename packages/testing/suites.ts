import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import definitions from "./suites.json";

export const TEST_ROOT = fileURLToPath(new URL("./", import.meta.url));
export const REPO_ROOT = resolve(TEST_ROOT, "../..");

interface Definition {
  config?: string;
  cwd: string;
  dom?: boolean;
  id: string;
  owner: string;
  roots: string[];
  runtime: string;
}
export interface Suite extends Definition {
  tests: string[];
}
export interface Selection {
  e2e?: boolean;
  feature?: string;
  owner?: string;
  runtime?: string;
}
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const SERIAL_FEATURES: Record<string, string> = {
  "e2e/shared/serial/admin-catalog.spec.ts": "gestures",
  "e2e/shared/serial/admin-languages.spec.ts": "translation",
  "e2e/shared/serial/admin-settings.spec.ts": "admin",
};

/** Node-safe discovery: runner configs must not import Bun or native globals. */
export function discoverSuites(testRoot: string = TEST_ROOT): Suite[] {
  const suites: Suite[] = definitions.map((definition) => ({
    ...definition,
    tests: [],
  }));
  const files = ["bun", "workers", "native", "e2e"]
    .flatMap((runtime) =>
      readdirSync(join(testRoot, runtime), { recursive: true }).map(
        (file) => `${runtime}/${file}`
      )
    )
    .filter((file) => TEST_FILE.test(file))
    .sort();
  for (const file of files) {
    const candidates = suites.flatMap((suite) =>
      suite.roots
        .filter((root) => file.startsWith(`${root}/`))
        .map((root) => ({ length: root.length, suite }))
    );
    candidates.sort((a, b) => b.length - a.length);
    const [first] = candidates;
    if (!first || candidates[1]?.length === first.length) {
      throw new Error(`Test must belong to exactly one suite: ${file}`);
    }
    first.suite.tests.push(file);
  }
  return suites;
}

export function selectSuites(selection: Selection = {}): Suite[] {
  const suites = discoverSuites()
    .filter(
      (suite) =>
        (!selection.owner ||
          suite.owner === selection.owner.replace("@smog/", "")) &&
        (!selection.runtime || suite.runtime === selection.runtime) &&
        (selection.e2e || suite.runtime !== "e2e")
    )
    .map((suite) => ({
      ...suite,
      tests: suite.tests.filter(
        (file) =>
          !selection.feature ||
          (SERIAL_FEATURES[file] ?? file.split("/")[1]) === selection.feature
      ),
    }))
    .filter((suite) => suite.tests.length > 0);
  if (suites.length === 0) {
    throw new Error(`No test suites match ${JSON.stringify(selection)}`);
  }
  return suites;
}

/** Configs and the CLI share discovery, so selecting and running cannot drift. */
export function suiteTests(id: string): string[] {
  const suite = discoverSuites().find((item) => item.id === id);
  if (!suite || suite.tests.length === 0) {
    throw new Error(`Empty or unknown test suite: ${id}`);
  }
  return suite.tests.map((file) => join(TEST_ROOT, file));
}
