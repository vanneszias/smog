import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Phase 9 ruling 7: a sponsorship link (`/sponsor/edit`, `/sponsor/renew`)
 * carries its raw token in the URL fragment, never in a query. This is a
 * tripwire, not a proof: it cannot recognise every way to build a URL. It
 * fails on (1) any `token=` that is not a fragment (`#token=`), also when
 * a string is concatenated or a template is split over lines, (2) a
 * `searchParams.set/append("token"` or `URLSearchParams({ token`, and (3)
 * the sponsor page paths appearing in non-test code outside the one
 * builder (`sponsorshipLinkUrl`), the legacy table and the routes, so a
 * second builder has to be added here, in review, on purpose. The
 * allow-list: the three Better Auth links in `samples.ts` and the mobile
 * magic link. `violations` is exercised on each bypass pattern below.
 */
const ROOT = new URL("../../../../..", import.meta.url).pathname;
const SOURCE = /\.(?:ts|tsx|mjs|js|json)$/;
const TEST_FILE = /\.test\.[a-z]+$/;
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".wrangler"]);
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^[ \t]*\/\/.*$/gm;
/** `token=` that is not the fragment's `#token=` (nor `session_token=`). */
const QUERY_TOKEN = /(?<![\w#])token=(?!\{)/g;
const SET_TOKEN = /searchParams\s*\.\s*(?:set|append)\s*\(\s*["'`]token["'`]/;
const PARAMS_TOKEN = /URLSearchParams\s*\(\s*\{[^}]*\btoken\b/;
const SPONSOR_PATH = /\/sponsor\/(?:edit|renew)\b/;

/** Roots to scan, as directories under the repository root. */
function roots(): string[] {
  const found = ["apps/site/src", "apps/mobile/app", "apps/mobile/src"];
  for (const group of ["packages", "packages/features"]) {
    for (const name of readdirSync(join(ROOT, group))) {
      const src = join(group, name, "src");
      if (name !== "features" && safeIsDir(join(ROOT, src))) {
        found.push(src);
      }
    }
  }
  return found;
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Files that may name the sponsor pages' paths in code (not comments). */
/** Better Auth's own `token` query parameter (single-use, read by the server). */
const AUTH_PARAM_FILES = [
  "apps/site/src/routes/magic-link_.app.tsx",
  "packages/auth/src/server.ts",
];
const PATH_OWNERS = [
  // Generated: the route table.
  "apps/site/src/routeTree.gen.ts",
  "packages/features/sponsorships/src/schema/tokens.ts",
  "apps/site/src/lib/legacy-redirects.ts",
  // A sample link (fragment form) for the template previews.
  "packages/email/src/samples.ts",
];
const ROUTES = /^apps\/site\/src\/routes\/sponsor\/(?:edit|renew)\.tsx$/;

/** Allowed query-token tails, per file (a line must end with tail + ","). */
const ALLOWED: Record<string, readonly string[]> = {
  "packages/email/src/samples.ts": [
    "/api/auth/magic-link/verify?token=sample`",
    "/reset-password?token=sample`",
    "/api/auth/verify-email?token=sample`",
  ],
};
/** The mobile magic link (`/magic-link/app?token=`) in the app's intent. */
const MOBILE_MAGIC_LINK = /\/magic-link(?:\/app)?\?token=/;

function withoutComments(text: string): string {
  return text.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

/** Problems in one file's text (`name` is relative to the repository root). */
export function violations(name: string, raw: string): string[] {
  const code = withoutComments(raw);
  const problems: string[] = [];
  const allowed = ALLOWED[name] ?? [];
  const lines = code.split("\n");
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    QUERY_TOKEN.lastIndex = 0;
    if (
      QUERY_TOKEN.test(text) &&
      !allowed.some((tail) => text.endsWith(`${tail},`)) &&
      !(name.startsWith("apps/mobile/") && MOBILE_MAGIC_LINK.test(text))
    ) {
      problems.push(`${name}:${index + 1} query token`);
    }
  }
  if (
    (SET_TOKEN.test(code) || PARAMS_TOKEN.test(code)) &&
    !AUTH_PARAM_FILES.includes(name)
  ) {
    problems.push(`${name} builds a token query parameter`);
  }
  if (
    SPONSOR_PATH.test(code) &&
    !PATH_OWNERS.includes(name) &&
    !ROUTES.test(name)
  ) {
    problems.push(`${name} names a sponsor page path (one builder only)`);
  }
  return problems;
}

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) {
        yield* sources(path);
      }
    } else if (SOURCE.test(name) && !TEST_FILE.test(name)) {
      yield path;
    }
  }
}

describe("no sponsorship link is built with a ?token= query (phase 9 ruling 7)", () => {
  test("the sources hold no query token or second builder", () => {
    const found: string[] = [];
    for (const area of roots()) {
      for (const file of sources(join(ROOT, area))) {
        found.push(
          ...violations(relative(ROOT, file), readFileSync(file, "utf8"))
        );
      }
    }
    expect(found).toEqual([]);
  });

  test("the allow-list is not stale", () => {
    for (const [file, lines] of Object.entries(ALLOWED)) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const line of lines) {
        expect(text, `${file}: ${line}`).toContain(line);
      }
    }
    for (const file of [...AUTH_PARAM_FILES, ...PATH_OWNERS]) {
      expect(statSync(join(ROOT, file)).isFile()).toBe(true);
    }
    for (const file of PATH_OWNERS.filter((f) => !f.endsWith("gen.ts"))) {
      expect(readFileSync(join(ROOT, file), "utf8")).toMatch(SPONSOR_PATH);
    }
  });
});

describe("the guard fails on each bypass pattern (self-test)", () => {
  const LIB = "apps/site/src/lib/x.ts";
  const cases: [string, string][] = [
    ["a plain query", "const u = `/x?token=T`;"],
    ["a second parameter", "const u = `/x?a=1&token=T`;"],
    ["string concatenation", 'const u = o + "?" + "token=" + t;'],
    ["a template split over lines", "const u = `/x?\ntoken=T`;"],
    ["searchParams.set", 'url.searchParams.set("token", t);'],
    ["searchParams.append", "url.searchParams\n  .append('token', t);"],
    ["URLSearchParams object", "new URLSearchParams({ a: 1, token });"],
    ["a sponsor page path elsewhere", 'const p = "/sponsor/edit";'],
    ["the renew path in a template", "const p = `/sponsor/renew#x`;"],
  ];
  test.each(cases)("%s", (_name, code) => {
    expect(violations(LIB, code)).not.toEqual([]);
  });

  test("what stays legal", () => {
    expect(violations(LIB, "const u = `/x#token=T`;")).toEqual([]);
    expect(violations(LIB, "// /sponsor/edit?token= was the old form")).toEqual(
      []
    );
    expect(violations(LIB, "/** `/sponsor/renew?token=` */")).toEqual([]);
    expect(violations(LIB, "cookie: smog.session_token=abc")).toEqual([]);
    expect(
      violations(
        "packages/email/src/samples.ts",
        "url: `/reset-password?token=sample`,"
      )
    ).toEqual([]);
    expect(
      violations(
        "apps/mobile/app/+native-intent.tsx",
        "? `/magic-link?token=T`"
      )
    ).toEqual([]);
  });
});
