import { gzipSync } from "node:zlib";

/*
 * The bundle budgets of `perf-budget.json` (phase 9 task 6, ruling 4):
 * the JavaScript a first visit to a route loads (the client entry, its
 * static-import closure, and the route's own lazy chunks, found in the
 * client build's Vite manifest) in gzip bytes, and the Worker's. Pure:
 * `deploy-guard.ts` reads the files and calls these.
 */

/** Headroom over a measurement when a budget is (re)set: measured + 15 %. */
export const BUDGET_HEADROOM = 1.15;

/**
 * A budget this much above `measured + headroom` earns the "lower the
 * budget" hint: a split landed, so the number should follow it down.
 */
export const RATCHET_SLACK = 1.1;

export interface EntryBudget {
  /** The budget in gzip bytes: the measurement + 15 % when it was set. */
  gzip: number;
  /** Why the target is not reached (blocked), or what a split gained. */
  note?: string;
  /**
   * The route modules (`src/routes/<file>`) whose `?tsr-split=component`
   * chunks load for one visit; each inner list is one visit, the entry is
   * the largest of them.
   */
  routes: string[][];
  /** The 200 kB / 300 kB target of ruling 4 this entry is held to. */
  target: number;
}

export interface PerfBudget {
  entries: Record<string, EntryBudget>;
  /** The Worker script's hard cap (ruling 4), gzip bytes. */
  workerGzip: number;
}

export interface ManifestFile {
  file: string;
  imports: string[];
  isEntry: boolean;
}

export interface EntrySize {
  chunks: number;
  gzip: number;
  raw: number;
}

export interface PerfResult {
  errors: string[];
  hints: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The manifest as a key to chunk map. */
export function readManifest(manifest: unknown): Map<string, ManifestFile> {
  const chunks = new Map<string, ManifestFile>();
  if (!isRecord(manifest)) {
    return chunks;
  }
  for (const [key, value] of Object.entries(manifest)) {
    if (isRecord(value) && typeof value.file === "string") {
      chunks.set(key, {
        file: value.file,
        imports: Array.isArray(value.imports)
          ? value.imports.filter((item) => typeof item === "string")
          : [],
        isEntry: value.isEntry === true,
      });
    }
  }
  return chunks;
}

function closure(
  chunks: Map<string, ManifestFile>,
  roots: readonly string[]
): Set<string> {
  const seen = new Set<string>();
  const pending = [...roots];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    const chunk = chunks.get(key);
    if (chunk && !seen.has(key)) {
      seen.add(key);
      pending.push(...chunk.imports);
    }
  }
  return seen;
}

/** The split chunk of a route file's component, `undefined` if the build has none. */
function routeKey(
  chunks: Map<string, ManifestFile>,
  route: string
): string | undefined {
  const key = `src/routes/${route}?tsr-split=component`;
  return chunks.has(key) ? key : undefined;
}

/** gzip bytes of a built file's text; the size every budget is measured in. */
export function gzipSize(content: string): number {
  return gzipSync(content).length;
}

/**
 * The initial JavaScript of each budget entry: the client entry plus, for
 * every visit the entry lists, that visit's route chunks, each with its
 * static imports; the entry is the largest visit. Throws when a listed
 * route has no chunk (a renamed route would otherwise pass unmeasured).
 */
export function measureEntries(
  manifest: unknown,
  budget: PerfBudget,
  read: (file: string) => string
): Map<string, EntrySize> {
  const chunks = readManifest(manifest);
  const entries = [...chunks.entries()]
    .filter(([, chunk]) => chunk.isEntry)
    .map(([key]) => key);
  if (entries.length === 0) {
    throw new Error("no entry chunk in the client manifest");
  }
  const sizes = new Map<string, { gzip: number; raw: number }>();
  const sizeOf = (key: string): { gzip: number; raw: number } => {
    const cached = sizes.get(key);
    if (cached) {
      return cached;
    }
    const content = read(chunks.get(key)?.file ?? "");
    const size = { gzip: gzipSize(content), raw: Buffer.byteLength(content) };
    sizes.set(key, size);
    return size;
  };
  const result = new Map<string, EntrySize>();
  for (const [name, entry] of Object.entries(budget.entries)) {
    let largest: EntrySize = { chunks: 0, gzip: 0, raw: 0 };
    for (const visit of entry.routes) {
      const roots = [...entries];
      for (const route of visit) {
        const key = routeKey(chunks, route);
        if (!key) {
          throw new Error(
            `entry "${name}": src/routes/${route} has no ?tsr-split=component chunk in the client manifest`
          );
        }
        roots.push(key);
      }
      const keys = [...closure(chunks, roots)];
      const total = keys.reduce(
        (sum, key) => ({
          gzip: sum.gzip + sizeOf(key).gzip,
          raw: sum.raw + sizeOf(key).raw,
        }),
        { gzip: 0, raw: 0 }
      );
      if (total.gzip > largest.gzip) {
        largest = { ...total, chunks: keys.length };
      }
    }
    result.set(name, largest);
  }
  return result;
}

/** The budget to record for a measurement: measured + 15 %, up to the next kB. */
export function budgetFor(measured: number): number {
  return Math.ceil((measured * BUDGET_HEADROOM) / 1000) * 1000;
}

function kb(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

/**
 * Fails when an entry (or the Worker) is over its budget; hints (does not
 * fail) when a budget is far enough above its measurement to lower.
 */
export function checkPerfBudget(
  budget: PerfBudget,
  entries: ReadonlyMap<string, EntrySize>,
  worker: { gzip: number }
): PerfResult {
  const errors: string[] = [];
  const hints: string[] = [];
  for (const [name, entry] of Object.entries(budget.entries)) {
    const measured = entries.get(name)?.gzip;
    if (measured === undefined) {
      errors.push(`entry "${name}" was not measured`);
    } else if (measured > entry.gzip) {
      errors.push(
        `entry "${name}": ${kb(measured)} gzip of initial JavaScript is over its budget of ${kb(entry.gzip)} (target ${kb(entry.target)}). Split the code behind a lazy import, or, if the growth is wanted, raise the budget in apps/site/perf-budget.json with a docs/DECISIONS.md line.`
      );
    } else if (entry.gzip > budgetFor(measured) * RATCHET_SLACK) {
      hints.push(
        `entry "${name}": measured ${kb(measured)}, budget ${kb(entry.gzip)}: lower the budget to ${kb(budgetFor(measured))}`
      );
    }
  }
  if (worker.gzip > budget.workerGzip) {
    errors.push(
      `the Worker build is ${kb(worker.gzip)} gzip, over the ${kb(budget.workerGzip)} cap (Cloudflare's paid limit is 10 MiB gzip; ruling 4 keeps 5 MiB)`
    );
  }
  return { errors, hints };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * `perf-budget.json` as a `PerfBudget`, or a throw naming every problem: a
 * missing or misspelled number would otherwise make its comparison false and
 * the entry pass for ever.
 */
export function parsePerfBudget(raw: unknown): PerfBudget {
  if (!isRecord(raw)) {
    throw new Error("[deploy-guard] perf-budget.json must be an object");
  }
  const problems: string[] = [];
  if (!isPositive(raw.workerGzip)) {
    problems.push("workerGzip must be a positive number");
  }
  const entries = isRecord(raw.entries) ? raw.entries : {};
  if (Object.keys(entries).length === 0) {
    problems.push("entries must be a non-empty object");
  }
  for (const [name, entry] of Object.entries(entries)) {
    if (!isRecord(entry)) {
      problems.push(`entry "${name}" must be an object`);
      continue;
    }
    for (const key of ["gzip", "target"]) {
      if (!isPositive(entry[key])) {
        problems.push(`entry "${name}": ${key} must be a positive number`);
      }
    }
    const { routes } = entry;
    const valid =
      Array.isArray(routes) &&
      routes.length > 0 &&
      routes.every((visit) => isStringArray(visit) && visit.length > 0);
    if (!valid) {
      problems.push(
        `entry "${name}": routes must be a non-empty list of non-empty string lists`
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `[deploy-guard] apps/site/perf-budget.json is invalid:\n  ${problems.join("\n  ")}`
    );
  }
  return raw as unknown as PerfBudget;
}

const ROUTES_DIR = "src/routes/";
const COMPONENT_SPLIT = "?tsr-split=component";
/** Dev-only pages (compiled out of production) are not budgeted. */
const UNBUDGETED_PREFIX = "dev/";

/**
 * The route modules with a component chunk in the manifest that no entry
 * lists: a new route (or admin screen) must be given a budget.
 */
export function unbudgetedRoutes(
  manifest: unknown,
  budget: PerfBudget
): string[] {
  const listed = new Set(
    Object.values(budget.entries).flatMap((entry) => entry.routes.flat())
  );
  return [...readManifest(manifest).keys()]
    .filter(
      (key) => key.startsWith(ROUTES_DIR) && key.endsWith(COMPONENT_SPLIT)
    )
    .map((key) => key.slice(ROUTES_DIR.length, -COMPONENT_SPLIT.length))
    .filter(
      (route) => !(route.startsWith(UNBUDGETED_PREFIX) || listed.has(route))
    );
}

/** Anything that would ship a source map: a `.map` file or a map comment. */
export function checkNoSourceMaps(
  paths: readonly string[],
  files: readonly { content: string; path: string }[]
): void {
  const found = [
    ...paths.filter((path) => path.endsWith(".map")),
    ...files
      .filter((file) => file.content.includes("//# sourceMappingURL="))
      .map((file) => file.path),
  ];
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the build ships source maps (${found.join(", ")}): build.sourcemap must stay off in apps/site/vite.config.ts.`
    );
  }
}
