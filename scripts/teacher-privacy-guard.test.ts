/**
 * The source half of the teaching-data guard (phase 10c ruling 2): teacher
 * information and drawings are only read by `@smog/lessons/server` and its
 * routes. This scan fails when any other source file names their tables, a
 * teacher-only column or their R2 key prefixes, so a public gesture query,
 * the search index, the sitemap, a cache or a log line cannot start reading
 * them unnoticed. (The schema half is `packages/api/test/teacher-privacy.test.ts`,
 * the query half `packages/features/gestures/test/teacher-privacy.test.ts`.)
 *
 * A new reader of the teaching tables goes into `ALLOWED` with its reason, in
 * the commit that adds it, and gets its own role guard and authz row.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");

/**
 * What only the teaching code may name: tables, camel-case tables, the C note
 * column, R2 prefixes. The private route `/api/teacher/drawings/...` is a URL,
 * not a key prefix (`(?<!api/)`): the cache table and the drawing card name it.
 */
const TEACHING_NAMES =
  /gesture_teacher_info|gestureTeacherInfo|gesture_drawing|gestureDrawing|\bc_note\b|\bcNote\b|(?<!api\/)teacher\/drawings|teacher\/pdf/;

/** Path prefixes (relative to the root) that may name them, each with its reason. */
const ALLOWED: { because: string; prefix: string }[] = [
  {
    because: "the schema, the row types, the enums and the retention sweep",
    prefix: "packages/db/src/schema/",
  },
  {
    because: "the closed audit and drawing enums",
    prefix: "packages/db/src/enums.ts",
  },
  { because: "the row types", prefix: "packages/db/src/types.ts" },
  { because: "the schema barrel", prefix: "packages/db/src/index.ts" },
  {
    because: "the orphan and PDF cache sweeps of the daily retention",
    prefix: "packages/db/src/retention.ts",
  },
  {
    because: "the dev seed (three invented teacher info rows)",
    prefix: "packages/db/scripts/seed.ts",
  },
  {
    because: "the test helpers and factories",
    prefix: "packages/db/src/testing/",
  },
  {
    because: "the lessons feature itself",
    prefix: "packages/features/lessons/",
  },
  {
    because: "the audit entry shapes name the target type, never a text",
    prefix: "packages/features/admin/src/schema/audit.ts",
  },
  {
    because: "the audit screen's label for the target type",
    prefix: "apps/site/src/components/admin/audit-data.tsx",
  },
  {
    because:
      "the Teacher info editor (a teacher, translator or admin; its data comes from the role-guarded teacher.* procedures)",
    prefix: "apps/site/src/components/admin/teacher/",
  },
  {
    because:
      "the Teacher info e2e posts the seven teacher fields to the role-guarded procedures",
    prefix: "apps/site/e2e/admin-teacher-info.spec.ts",
  },
  {
    because: "the role-guarded teacher routes (drawings, PDFs)",
    prefix: "apps/site/src/routes/api/teacher/",
  },
  {
    because:
      "the drawing read and upload handlers (teacher, translator or admin session; signed PUT)",
    prefix: "apps/site/src/server/teacher-drawings.ts",
  },
];

const SOURCE = /\.(ts|tsx)$/;
const SKIPPED =
  /(^|\/)(node_modules|dist|build|\.wrangler|\.expo|\.output|\.tanstack|\.turbo|test|testing|__fixtures__)(\/|$)|\.test\.tsx?$|\.gen\.ts$|worker-configuration\.d\.ts$/;

/** Every file of `files` outside `ALLOWED` that names the teaching material. */
export function findViolations(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(
      ([path, text]) =>
        TEACHING_NAMES.test(text) &&
        !ALLOWED.some(({ prefix }) => path.startsWith(prefix))
    )
    .map(([path]) => path)
    .sort();
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const rel = relative(ROOT, path);
    if (SKIPPED.test(rel) || name.startsWith(".")) {
      return [];
    }
    if (statSync(path).isDirectory()) {
      return walk(path);
    }
    return SOURCE.test(name) ? [path] : [];
  });
}

function repositorySources(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const root of ["apps", "packages"]) {
    for (const path of walk(join(ROOT, root))) {
      files[relative(ROOT, path)] = readFileSync(path, "utf8");
    }
  }
  return files;
}

describe("teaching data stays out of public code", () => {
  test("a public reader that names the tables is caught", () => {
    expect(
      findViolations({
        "apps/site/src/worker/cache.ts": "get('teacher/drawings/g1/1/u')",
        "packages/db/src/fts.ts": "gesture_teacher_info",
        "packages/db/src/schema/teacher.ts": "export const gestureTeacherInfo",
        "packages/features/gestures/src/server/queries.ts":
          "db.select({ n: gestureTeacherInfo.hc }).from(gestureTeacherInfo)",
        "packages/features/gestures/src/server/search.ts":
          "SELECT c_note FROM gesture_teacher_info",
        "packages/features/gestures/src/server/sitemap.ts": "const ok = 1",
        "packages/features/lessons/src/server/info.ts": "gesture_drawing",
      })
    ).toEqual([
      "apps/site/src/worker/cache.ts",
      "packages/db/src/fts.ts",
      "packages/features/gestures/src/server/queries.ts",
      "packages/features/gestures/src/server/search.ts",
    ]);
  });

  test("the private drawing URL is not an R2 key prefix, a bare key prefix is", () => {
    expect(
      findViolations({
        "apps/site/src/a.ts": "fetch('/api/teacher/drawings/g1/1')",
        "apps/site/src/b.ts": "bucket.get('teacher/drawings/g1/1/u1')",
      })
    ).toEqual(["apps/site/src/b.ts"]);
  });

  test("every allowed prefix exists (no stale row)", () => {
    for (const { prefix } of ALLOWED) {
      expect(existsSync(join(ROOT, prefix)), prefix).toBe(true);
    }
  });

  test("no source outside the allowed files names the teaching tables, columns or key prefixes", () => {
    const files = repositorySources();
    expect(Object.keys(files).length).toBeGreaterThan(500);
    expect(findViolations(files)).toEqual([]);
  });
});
