/**
 * The documents say only what is true (phase 9 task 11). A machine reads
 * AGENTS.md, README.md and `docs/*.md` and fails on:
 *
 * - a `bun run <script>` / `bun -F @smog/<pkg> <script>` that no
 *   `package.json` defines;
 * - a relative link, a link anchor or a repository path in backticks that
 *   does not resolve (gitignored paths are recognised through `git
 *   check-ignore`; the rest of the exceptions are in `PATH_ALLOW`, each with
 *   its reason);
 * - a `docs/DECISIONS.md` section quoted by title that does not exist;
 * - a statement of "the next free migration number" that is not the real one;
 * - the CI job names, shards and lanes AGENTS.md lists, against `ci.yml`
 *   and the Playwright config.
 *
 * The checkers are pure functions over text, so the tests below prove that
 * each one fails on a deliberately broken document. DECISIONS.md is history
 * (it says "the next free number is 0013" in a phase 9 section on purpose),
 * so it is only read for headings.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = new URL("../../../../..", import.meta.url).pathname;

/** The documents under the machine's eye. */
const DOCS = [
  "AGENTS.md",
  "README.md",
  "docs/deployment.md",
  "docs/cutover-runbook.md",
  "docs/API.md",
  "docs/DATA_MODEL.md",
  "docs/LEGAL-SIGNOFF.md",
  "docs/PROGRESS.md",
] as const;

/**
 * Paths a document names that are not (yet) in the tree, and why. A prefix
 * ends with `/`. Gitignored paths are not listed: `git check-ignore` decides
 * those.
 */
const PATH_ALLOW: readonly { path: string; why: string }[] = [
  {
    path: "docs/superpowers/analysis/",
    why: "the old system's analysis, read from origin/master too",
  },
  {
    path: "apps/site/dist/",
    why: "build output (gitignored; kept here for CI without a git directory)",
  },
  {
    path: "apps/mobile/dist/",
    why: "expo export output (gitignored)",
  },
  {
    path: "docs/README.md",
    why: "the turbo package's own docs/README.md, named by the block turbo writes into AGENTS.md",
  },
  {
    path: "apps/site/e2e/phase6.ts",
    why: "deleted in phase 6 task 9; the history log of PROGRESS.md names it",
  },
  {
    path: "docs/superpowers/plans/",
    why: "a plan is named by a phase, written when the phase starts",
  },
];

/** Root files a document may name without a directory. */
const ROOT_FILES = new Set([
  "README.md",
  "AGENTS.md",
  "package.json",
  "turbo.json",
  "biome.json",
  "biome.jsonc",
  "bunfig.toml",
  "knip.json",
  "bun.lock",
]);

const FENCE = /^(```|~~~)/;
/** A repository path: a known top-level directory, then segments. */
const REPO_PATH =
  /^(?:\.github|apps|packages|scripts|docs|patches)\/[\w@.\-/[\]()+]+$/;
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const BUN_RUN = /\bbun run ([\w:.-]+)/g;
const ANY_HEADING = /^#{1,6}\s+(.+?)\s*#*$/;
const DECISION_HEADING = /^#{2,4}\s+(.+)$/;
const DECISION_ENTRY = /^- \*\*(?:\d{4}-\d{2}-\d{2} · )?(.+?)\*\*/;
const MIGRATION_FILE = /^(\d{4})_.*\.sql$/;
const BACKTICK = /`/g;
const SLUG_DROP = /[^\p{L}\p{N}\s-]/gu;
const WHITESPACE = /\s/g;
const LEAD_PUNCT = /^[("'`[]+/;
const TRAIL_PUNCT = /[)"'`\],.;:!?]+$/;
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;
const ANCHOR_SUFFIX = /#.*$/;
const PATTERN_CHARS = /[*<>{}$|=]|\.\.\./;
const CODE_SPAN = /`([^`]+)`/g;
const SPACES = /\s+/;
const LEADING_SLASH = /^\//;
const TRAILING_SLASH = /\/$/;
const REGEX_SPECIALS = /[.+?^${}()|[\]\\]/g;
const STAR = /\*/g;
const PROJECT_USAGE = /--project public\|[\w|-]+/;
const URL_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const BUN_FILTER = /\bbun (?:-F|--filter)[ =](@smog\/[\w-]+) ([\w:.-]+)/g;

interface Ctx {
  /** Heading slugs of a markdown file (repository-relative), or null. */
  anchorsOf: (path: string) => ReadonlySet<string> | null;
  /** `## ` headings and bold entry titles of DECISIONS.md, lower-cased. */
  decisionTitles: readonly string[];
  /** Does a path exist (any file or directory)? */
  exists: (path: string) => boolean;
  /** The real next migration number, zero-padded. */
  nextMigration: string;
  /** Package name -> its scripts. */
  packages: ReadonlyMap<string, ReadonlySet<string>>;
  /** Does a repository path exist, or is it allowed or gitignored? */
  pathOk: (path: string) => boolean;
  /** Root `package.json` scripts. */
  rootScripts: ReadonlySet<string>;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as Record<
    string,
    unknown
  >;
}

function scriptsOf(pkg: Record<string, unknown>): ReadonlySet<string> {
  return new Set(Object.keys((pkg.scripts as object | undefined) ?? {}));
}

function listPackages(): Map<string, ReadonlySet<string>> {
  const map = new Map<string, ReadonlySet<string>>();
  const roots = ["apps", "packages", "packages/features"];
  for (const dir of roots) {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const manifest = join(dir, entry, "package.json");
      if (!existsSync(join(ROOT, manifest))) {
        continue;
      }
      const pkg = readJson(manifest);
      map.set(String(pkg.name), scriptsOf(pkg));
    }
  }
  return map;
}

/**
 * The `.gitignore` read by hand, for a tree without a `.git` directory (a
 * source archive): a pattern with a slash anchors at the root, one without
 * matches any path segment, `*` stays inside a segment, and the last
 * matching rule wins, negations included, as in git.
 */
function ignoredByFile(path: string): boolean {
  const file = join(ROOT, ".gitignore");
  if (!existsSync(file)) {
    return false;
  }
  const segments = path.split("/");
  let ignored = false;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const negated = line.startsWith("!");
    const pattern = (negated ? line.slice(1) : line)
      .replace(LEADING_SLASH, "")
      .replace(TRAILING_SLASH, "");
    const source = pattern
      .replace(REGEX_SPECIALS, "\\$&")
      .replace(STAR, "[^/]*");
    const matches =
      pattern.includes("/") || line.startsWith("/")
        ? new RegExp(`^${source}(?:/|$)`).test(path)
        : segments.some((part) => new RegExp(`^${source}$`).test(part));
    if (matches) {
      ignored = !negated;
    }
  }
  return ignored;
}

function gitIgnored(path: string): boolean {
  try {
    const result = Bun.spawnSync(["git", "check-ignore", "-q", path], {
      cwd: ROOT,
    });
    // 0: ignored, 1: not ignored, 128: not a repository.
    return result.exitCode === 128
      ? ignoredByFile(path)
      : result.exitCode === 0;
  } catch {
    // No git executable at all.
    return ignoredByFile(path);
  }
}

/** GitHub's heading slug: lower case, no punctuation, spaces to dashes. */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(BACKTICK, "")
    .replace(SLUG_DROP, "")
    .trim()
    .replace(WHITESPACE, "-");
}

function headingsOf(text: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
    }
    const title = fenced ? undefined : line.match(ANY_HEADING)?.[1];
    if (title) {
      out.push(title);
    }
  }
  return out;
}

function decisionTitles(text: string): string[] {
  const titles: string[] = [];
  for (const line of text.split("\n")) {
    const heading = line.match(DECISION_HEADING)?.[1];
    if (heading) {
      titles.push(heading.toLowerCase());
    }
    const entry = line.match(DECISION_ENTRY)?.[1];
    if (entry) {
      titles.push(entry.toLowerCase());
    }
  }
  return titles;
}

function buildCtx(): Ctx {
  const rootPkg = readJson("package.json");
  const migrations = readdirSync(join(ROOT, "packages/db/migrations"))
    .map((name) => name.match(MIGRATION_FILE)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const next = String(Math.max(...migrations) + 1).padStart(4, "0");
  const anchors = new Map<string, ReadonlySet<string> | null>();
  return {
    anchorsOf: (path) => {
      if (!anchors.has(path)) {
        anchors.set(
          path,
          existsSync(join(ROOT, path))
            ? new Set(
                headingsOf(readFileSync(join(ROOT, path), "utf8")).map(slug)
              )
            : null
        );
      }
      return anchors.get(path) ?? null;
    },
    decisionTitles: decisionTitles(
      readFileSync(join(ROOT, "docs/DECISIONS.md"), "utf8")
    ),
    exists: (path) => existsSync(join(ROOT, path)),
    nextMigration: next,
    packages: listPackages(),
    pathOk: (path) =>
      existsSync(join(ROOT, path)) ||
      PATH_ALLOW.some((a) =>
        a.path.endsWith("/") ? path.startsWith(a.path) : path === a.path
      ) ||
      gitIgnored(path),
    rootScripts: scriptsOf(rootPkg),
  };
}

/** Prose and code, with the fenced blocks kept apart where it matters. */
function lines(text: string): { line: string; fenced: boolean; no: number }[] {
  let fenced = false;
  return text.split("\n").map((line, i) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return { fenced: true, line, no: i + 1 };
    }
    return { fenced, line, no: i + 1 };
  });
}

function stripPathToken(raw: string): string {
  return raw
    .replace(LEAD_PUNCT, "")
    .replace(TRAIL_PUNCT, "")
    .replace(LINE_SUFFIX, "")
    .replace(ANCHOR_SUFFIX, "");
}

/** Does a token stand for a set or a placeholder rather than one path? */
function isPattern(token: string): boolean {
  return PATTERN_CHARS.test(token);
}

function pathTokens(line: string, fenced: boolean): string[] {
  const spans: string[] = [];
  if (fenced) {
    spans.push(line);
  } else {
    for (const m of line.matchAll(CODE_SPAN)) {
      if (m[1]) {
        spans.push(m[1]);
      }
    }
  }
  const tokens: string[] = [];
  for (const span of spans) {
    for (const raw of span.split(SPACES)) {
      const token = stripPathToken(raw);
      if (!token || isPattern(token)) {
        continue;
      }
      if (REPO_PATH.test(token) || ROOT_FILES.has(token)) {
        tokens.push(token);
      }
    }
  }
  return tokens;
}

function checkCommands(doc: string, text: string, ctx: Ctx): string[] {
  const problems: string[] = [];
  for (const { line, no } of lines(text)) {
    for (const m of line.matchAll(BUN_RUN)) {
      const name = m[1] ?? "";
      if (!ctx.rootScripts.has(name)) {
        problems.push(`${doc}:${no}: \`bun run ${name}\` is not a root script`);
      }
    }
    for (const m of line.matchAll(BUN_FILTER)) {
      const pkg = ctx.packages.get(m[1] ?? "");
      const name = m[2] ?? "";
      if (!pkg) {
        problems.push(`${doc}:${no}: unknown package ${m[1]}`);
      } else if (!pkg.has(name)) {
        problems.push(`${doc}:${no}: ${m[1]} has no script "${name}"`);
      }
    }
  }
  return problems;
}

function checkPaths(doc: string, text: string, ctx: Ctx): string[] {
  const problems: string[] = [];
  for (const { line, fenced, no } of lines(text)) {
    for (const token of pathTokens(line, fenced)) {
      if (!ctx.pathOk(token)) {
        problems.push(`${doc}:${no}: path \`${token}\` does not exist`);
      }
    }
  }
  return problems;
}

function checkLinks(doc: string, text: string, ctx: Ctx): string[] {
  const problems: string[] = [];
  const base = dirname(doc);
  for (const { line, fenced, no } of lines(text)) {
    if (fenced) {
      continue;
    }
    for (const m of line.matchAll(LINK)) {
      const target = m[1] ?? "";
      if (URL_SCHEME.test(target)) {
        continue;
      }
      const [file = "", anchor] = target.split("#");
      const resolved =
        file === "" ? doc : relative(ROOT, resolve(ROOT, base, file));
      if (file !== "" && !ctx.pathOk(resolved)) {
        problems.push(`${doc}:${no}: link ${target} does not resolve`);
        continue;
      }
      if (anchor && resolved.endsWith(".md")) {
        const anchors = ctx.anchorsOf(resolved);
        if (anchors && !anchors.has(anchor)) {
          problems.push(`${doc}:${no}: link ${target} has no such heading`);
        }
      }
    }
  }
  return problems;
}

const DECISION_REF =
  /DECISIONS(?:\.md)?[`]?(?:,| entry|,? section)? ?\(?["“]([^"”]+)["”]/g;

function checkDecisionRefs(doc: string, text: string, ctx: Ctx): string[] {
  const problems: string[] = [];
  for (const { line, no } of lines(text)) {
    for (const m of line.matchAll(DECISION_REF)) {
      const quoted = (m[1] ?? "").toLowerCase();
      if (!ctx.decisionTitles.some((t) => t.includes(quoted))) {
        problems.push(
          `${doc}:${no}: DECISIONS has no section titled "${m[1]}"`
        );
      }
    }
  }
  return problems;
}

const NEXT_MIGRATION =
  /next free (?:migration )?(?:number|migration)(?: is|:)? (?:\*\*)?`?(\d{4})/gi;

function checkNextMigration(doc: string, text: string, ctx: Ctx): string[] {
  const problems: string[] = [];
  for (const { line, no } of lines(text)) {
    for (const m of line.matchAll(NEXT_MIGRATION)) {
      if (m[1] !== ctx.nextMigration) {
        problems.push(
          `${doc}:${no}: says the next free migration is ${m[1]}, it is ${ctx.nextMigration}`
        );
      }
    }
  }
  return problems;
}

function checkDoc(doc: string, text: string, ctx: Ctx): string[] {
  return [
    ...checkCommands(doc, text, ctx),
    ...checkPaths(doc, text, ctx),
    ...checkLinks(doc, text, ctx),
    ...checkDecisionRefs(doc, text, ctx),
    ...checkNextMigration(doc, text, ctx),
  ];
}

/** `key: [a, b, c]` of a workflow's matrix. */
function matrixList(workflow: string, key: string): string[] {
  const m = workflow.match(new RegExp(`${key}: \\[([^\\]]+)\\]`));
  return (m?.[1] ?? "").split(",").map((s) => s.trim());
}

function checkCiNames(
  agents: string,
  workflow: string,
  projects: readonly string[]
): string[] {
  const problems: string[] = [];
  const lanes = matrixList(workflow, "check");
  const shards = matrixList(workflow, "shard");
  for (const lane of lanes) {
    if (!agents.includes(`release:check:${lane}`)) {
      problems.push(`AGENTS.md does not name the lane release:check:${lane}`);
    }
  }
  for (const shard of shards) {
    if (!new RegExp(`\`${shard}\``).test(agents)) {
      problems.push(`AGENTS.md does not name the e2e shard \`${shard}\``);
    }
  }
  const usage = agents.match(PROJECT_USAGE)?.[0] ?? "";
  const listed = usage.replace("--project ", "").split("|");
  if (listed.join() !== shards.join() && listed.join() !== projects.join()) {
    problems.push(
      `AGENTS.md test:e2e usage lists ${listed.join("|")}, ci.yml has ${shards.join("|")}`
    );
  }
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
  const lanesWord = words[lanes.length] ?? String(lanes.length);
  if (!new RegExp(`${lanesWord} (?:CI )?lanes`).test(agents)) {
    problems.push(`AGENTS.md does not say "${lanesWord} lanes"`);
  }
  const shardWord = words[shards.length] ?? String(shards.length);
  if (
    !new RegExp(`${shardWord} (?:e2e )?shards|matrix of ${shardWord}`).test(
      agents
    )
  ) {
    problems.push(`AGENTS.md does not say "${shardWord} shards"`);
  }
  const jobWord = words[lanes.length + 1] ?? String(lanes.length + 1);
  if (!new RegExp(`${jobWord} jobs`).test(agents)) {
    problems.push(`AGENTS.md does not say "${jobWord} jobs"`);
  }
  return problems;
}

function playwrightProjects(): string[] {
  const config = readFileSync(
    join(ROOT, "packages/testing/config/playwright.ts"),
    "utf8"
  );
  return [...config.matchAll(/^\s+name: "([\w-]+)"/gm)].map((m) => m[1] ?? "");
}

const CTX = buildCtx();

describe("the documents are accurate", () => {
  for (const doc of DOCS) {
    test(`${doc}: commands, paths, links, DECISIONS titles, migration number`, () => {
      const text = readFileSync(join(ROOT, doc), "utf8");
      expect(checkDoc(doc, text, CTX)).toEqual([]);
    });
  }

  test("AGENTS.md names the CI lanes, e2e shards and job counts of ci.yml", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    const workflow = readFileSync(
      join(ROOT, ".github/workflows/ci.yml"),
      "utf8"
    );
    expect(checkCiNames(agents, workflow, playwrightProjects())).toEqual([]);
  });

  test("the allow-list names only things that are not in the tree", () => {
    for (const { path } of PATH_ALLOW) {
      if (path.startsWith("docs/superpowers/")) {
        continue; // plans and the analysis are in the tree on purpose
      }
      const absent = !statSafe(join(ROOT, path));
      expect(absent || gitIgnored(path)).toBe(true);
    }
  });
});

function statSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

describe("the checkers fail on a broken document", () => {
  const good =
    "See [the spec](docs/DATA_MODEL.md) and `packages/testing/e2e.ts`.";

  test("a good document passes", () => {
    expect(checkDoc("README.md", good, CTX)).toEqual([]);
  });

  test("a broken relative link fails", () => {
    const problems = checkDoc("README.md", "See [x](docs/nope.md).", CTX);
    expect(problems.join()).toContain("docs/nope.md does not resolve");
  });

  test("a broken anchor fails, a real one passes", () => {
    expect(
      checkDoc("README.md", "[x](docs/PROGRESS.md#no-such-heading)", CTX).length
    ).toBe(1);
    expect(checkDoc("README.md", "[x](docs/PROGRESS.md#phases)", CTX)).toEqual(
      []
    );
  });

  test("a path in backticks that does not exist fails", () => {
    const problems = checkDoc(
      "AGENTS.md",
      "Edit `apps/site/src/gone.ts`.",
      CTX
    );
    expect(problems.join()).toContain("apps/site/src/gone.ts");
  });

  test("a path inside a fenced command fails", () => {
    const text = "```bash\nbun scripts/gone.ts --env dev\n```";
    expect(checkDoc("AGENTS.md", text, CTX).join()).toContain(
      "scripts/gone.ts"
    );
  });

  test("a gitignored path passes without an allow-list entry", () => {
    expect(
      checkDoc("AGENTS.md", "Copy to `apps/site/.dev.vars`.", CTX)
    ).toEqual([]);
  });

  test("the ignore-file fallback (a tree without a repository) agrees", () => {
    for (const ignored of [
      "apps/site/.dev.vars",
      "apps/site/.wrangler/state/v3/d1",
      "apps/site/dist/server/wrangler.json",
      "apps/site/worker-configuration.d.ts",
    ]) {
      expect(ignoredByFile(ignored)).toBe(true);
    }
    for (const tracked of [
      "apps/site/src/worker.ts",
      "apps/site/.dev.vars.example",
      "docs/PROGRESS.md",
    ]) {
      expect(ignoredByFile(tracked)).toBe(false);
    }
  });

  test("a script that no package.json defines fails", () => {
    const text = "Run `bun run nonexistent` or `bun -F @smog/site nope`.";
    expect(checkDoc("AGENTS.md", text, CTX)).toHaveLength(2);
    expect(
      checkDoc("AGENTS.md", "`bun run check` `bun -F @smog/site test`", CTX)
    ).toEqual([]);
  });

  test("a quoted DECISIONS title that does not exist fails", () => {
    expect(
      checkDoc("docs/API.md", 'See DECISIONS "No such section".', CTX)
    ).toHaveLength(1);
    expect(
      checkDoc(
        "docs/API.md",
        'See `docs/DECISIONS.md`, "Mobile environments".',
        CTX
      )
    ).toEqual([]);
  });

  test("a wrong next free migration number fails", () => {
    const wrong = "The next free number is 0013.";
    expect(checkDoc("docs/API.md", wrong, CTX)).toHaveLength(1);
    const right = `The next free migration number is ${CTX.nextMigration}.`;
    expect(checkDoc("docs/API.md", right, CTX)).toEqual([]);
  });

  test("a CI name that ci.yml does not have fails", () => {
    const workflow = "check: [core, tests]\nshard: [public, admin]";
    const agents =
      "two lanes, `release:check:core` `release:check:tests`, three jobs, two e2e shards `public` `admin` (`--project public|admin`)";
    expect(checkCiNames(agents, workflow, [])).toEqual([]);
    expect(
      checkCiNames(agents.replace("`admin` ", ""), workflow, []).join()
    ).toContain("e2e shard `admin`");
    expect(
      checkCiNames(
        agents,
        "check: [core, tests, mobile]\nshard: [public, admin]",
        []
      ).join()
    ).toContain("release:check:mobile");
  });
});
