import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  REPO_ROOT,
  type Selection,
  type Suite,
  selectSuites,
  TEST_ROOT,
} from "./suites";

export function commandFor(suite: Suite, args: string[] = []): string[] {
  const tests = suite.tests.map((file) => join(TEST_ROOT, file));
  if (suite.runtime === "bun") {
    return [
      "bun",
      "test",
      "--timeout=20000",
      ...(suite.dom
        ? ["--preload", join(TEST_ROOT, "support/config/happy-dom.ts")]
        : []),
      ...tests,
      ...args,
    ];
  }
  if (suite.runtime === "workers") {
    return [
      "bunx",
      "--no-install",
      "vitest",
      "run",
      "--config",
      join(TEST_ROOT, suite.config ?? ""),
      ...tests,
      ...args,
    ];
  }
  if (suite.runtime === "native") {
    return [
      "bunx",
      "--no-install",
      "jest",
      "--config",
      join(TEST_ROOT, suite.config ?? ""),
      "--runTestsByPath",
      ...tests,
      ...args,
    ];
  }
  return [
    "bunx",
    "--no-install",
    "playwright",
    "test",
    "--config",
    join(TEST_ROOT, "config/playwright.ts"),
    ...args,
  ];
}

const OPTIONS = {
  feature: { type: "string" },
  "include-e2e": { type: "boolean" },
  "keep-going": { type: "boolean" },
  list: { type: "boolean" },
  package: { type: "string" },
  runtime: { type: "string" },
} as const;

export function parseRunnerArgs(argv: string[]) {
  const { values, tokens } = parseArgs({
    allowPositionals: true,
    args: argv,
    options: OPTIONS,
    strict: false,
    tokens: true,
  });
  for (const token of tokens) {
    if (
      token.kind === "option" &&
      ["feature", "package", "runtime"].includes(token.name) &&
      (!token.value || token.value.startsWith("-"))
    ) {
      throw new Error(`--${token.name} needs a value`);
    }
  }
  const forwarded = tokens
    .filter(
      (token) =>
        token.kind === "positional" ||
        (token.kind === "option" && !Object.hasOwn(OPTIONS, token.name))
    )
    .map((token) => argv[token.index] ?? "");
  const selection: Selection = {
    e2e: values["include-e2e"] === true || values.runtime === "e2e",
    feature: typeof values.feature === "string" ? values.feature : undefined,
    owner: typeof values.package === "string" ? values.package : undefined,
    runtime: typeof values.runtime === "string" ? values.runtime : undefined,
  };
  return {
    forwarded,
    keepGoing: values["keep-going"] === true,
    list: values.list === true,
    selection,
  };
}

export function invocationFor(
  suite: Suite,
  selection: Selection = {},
  args: string[] = []
): string[] {
  if (selection.feature && suite.runtime === "e2e") {
    // The orchestrator bounds each shard separately; bounding the chain would kill healthy long runs.
    return [
      "bun",
      join(TEST_ROOT, "e2e.ts"),
      ...args,
      ...suite.tests.map((file) => join(TEST_ROOT, file)),
    ];
  }
  return [
    "bun",
    join(TEST_ROOT, "deadline.ts"),
    "--",
    ...commandFor(suite, args),
  ];
}

async function main(argv: string[]): Promise<number> {
  const { selection, forwarded, list, keepGoing } = parseRunnerArgs(argv);
  let result = 0;
  for (const suite of selectSuites(selection)) {
    console.log(`[testing] ${suite.id}: ${suite.tests.length} files`);
    if (list) {
      for (const file of suite.tests) {
        console.log(`  ${file}`);
      }
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: bounded suites run sequentially to avoid pool/DOM mock contamination and memory pressure.
    const code = await Bun.spawn(invocationFor(suite, selection, forwarded), {
      cwd: resolve(REPO_ROOT, suite.cwd),
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    }).exited;
    if (code !== 0) {
      result = result || code;
      if (!keepGoing) {
        return result;
      }
    }
  }
  return result;
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (error) {
    console.error("[testing] Failed to run tests:", error);
    process.exit(1);
  }
}
