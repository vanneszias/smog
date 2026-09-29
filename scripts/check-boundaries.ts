import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  allowedTargets,
  isAllowedDependency,
  isAllowedImport,
  splitSpecifier,
  TOOLING_DEV_DEPENDENCIES,
} from "@smog/config/boundaries";

export interface Violation {
  /** Source file (relative to the root) for import violations. */
  file?: string;
  from: string;
  /** `undeclared`: imported but not declared; `unknown`: not in BOUNDARIES. */
  reason?: "undeclared" | "unknown";
  to: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

interface Workspace {
  dir: string;
  manifest: PackageJson & { name: string };
}

const SCOPE = "@smog/";
const SOURCE_GLOB = new Bun.Glob("**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}");
const SKIPPED_DIRS =
  /(^|\/)(node_modules|dist|build|\.wrangler|\.expo|\.output|\.tanstack|\.turbo|__fixtures__)\//;
/** `from`, `import`, `import()`, `require()` and `vi.mock()` / `jest.mock()`. */
const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\b(?:require|(?:vi|jest)\.(?:mock|doMock|unmock|importActual|requireActual))\s*\(\s*)["'](@smog\/[^"']+)["']/g;

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function workspacePatterns(manifest: PackageJson): string[] {
  const { workspaces } = manifest;
  if (Array.isArray(workspaces)) {
    return workspaces;
  }
  return workspaces?.packages ?? [];
}

function listWorkspaces(root: string): Workspace[] {
  const workspaces: Workspace[] = [];
  for (const pattern of workspacePatterns(
    readJson(join(root, "package.json"))
  )) {
    const glob = new Bun.Glob(`${pattern}/package.json`);
    for (const path of glob.scanSync({ cwd: root, onlyFiles: true })) {
      const manifest = readJson(join(root, path));
      if (manifest.name?.startsWith(SCOPE)) {
        workspaces.push({
          dir: dirname(path),
          manifest: { ...manifest, name: manifest.name },
        });
      }
    }
  }
  return workspaces.sort((a, b) => a.dir.localeCompare(b.dir));
}

function declaredDependencies(manifest: PackageJson): string[] {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  return [...names].filter((name) => name.startsWith(SCOPE)).sort();
}

function importedSpecifiers(
  root: string,
  workspace: Workspace
): { file: string; specifier: string }[] {
  const found: { file: string; specifier: string }[] = [];
  const cwd = join(root, workspace.dir);
  const files = [...SOURCE_GLOB.scanSync({ cwd, onlyFiles: true })]
    .filter((path) => !SKIPPED_DIRS.test(path))
    .sort();
  for (const path of files) {
    const source = readFileSync(join(cwd, path), "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const [, specifier] = match;
      if (specifier) {
        found.push({
          file: relative(root, join(cwd, path)),
          specifier,
        });
      }
    }
  }
  return found;
}

/** Checks every `@smog/*` workspace under `root` against `BOUNDARIES`. */
export function checkBoundaries(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const workspace of listWorkspaces(root)) {
    const from = workspace.manifest.name;
    if (!allowedTargets(from)) {
      violations.push({ from, reason: "unknown", to: from });
      continue;
    }
    const declared = declaredDependencies(workspace.manifest);
    const devOnly = new Set(
      Object.keys(workspace.manifest.devDependencies ?? {}).filter(
        (name) =>
          !(
            workspace.manifest.dependencies?.[name] ||
            workspace.manifest.optionalDependencies?.[name] ||
            workspace.manifest.peerDependencies?.[name]
          )
      )
    );
    for (const to of declared) {
      const tooling = devOnly.has(to) && TOOLING_DEV_DEPENDENCIES.includes(to);
      if (!(tooling || isAllowedDependency(from, to))) {
        violations.push({ from, to });
      }
    }
    for (const { file, specifier } of importedSpecifiers(root, workspace)) {
      const [pkg] = splitSpecifier(specifier);
      if (!isAllowedImport(from, specifier)) {
        violations.push({ file, from, to: specifier });
      } else if (pkg !== from && !declared.includes(pkg)) {
        violations.push({ file, from, reason: "undeclared", to: specifier });
      }
    }
  }
  return violations;
}

export function formatViolation(violation: Violation): string {
  const { from, to, file, reason } = violation;
  if (reason === "unknown") {
    return `${from} is not listed in @smog/config/boundaries`;
  }
  if (reason === "undeclared") {
    return `${file}: ${from} imports ${to} without declaring it`;
  }
  if (file) {
    return `${file}: ${from} may not import ${to}`;
  }
  return `${from} may not depend on ${to}`;
}

if (import.meta.main) {
  const root = process.argv[2] ?? join(import.meta.dir, "..");
  try {
    const violations = checkBoundaries(root);
    if (violations.length > 0) {
      for (const violation of violations) {
        console.error(`boundaries: ${formatViolation(violation)}`);
      }
      process.exit(1);
    }
    console.log("boundaries: ok");
  } catch (error) {
    console.error("[checkBoundaries] Failed to check boundaries:", error);
    throw error;
  }
}
