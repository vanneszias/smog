/**
 * The repository-level security guards (phase 9 task 8, ruling 16):
 *
 * 1. The rate-limit table: every route file of `apps/site/src/routes` is
 *    listed with its limiter (`RL_API`, `RL_SPONSOR`, `RL_AUTH`,
 *    `RL_ANALYTICS`) or an explicit "none, because"; a route with neither,
 *    a stale row, or a limiter the named source does not use, fails.
 *    `docs/API.md` carries the same table for readers.
 * 2. The log scan: no `console.*` call interpolates an identifier named
 *    like a secret or personal datum (`token`, `secret`, `password`,
 *    `code`, `authorization`, `cookie`, `apiKey`, `email`) unless it goes
 *    through the redaction helper (`@smog/utils`: `redactMessage`,
 *    `errorSummary`) or has an allow-list entry with a reason.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ROUTES = join(ROOT, "apps", "site", "src", "routes");

function walk(dir: string, accept: (path: string) => boolean): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) {
      return [];
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return walk(path, accept);
    }
    return accept(path) ? [path] : [];
  });
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// 1. The rate-limit table
// ---------------------------------------------------------------------------

type Binding = "RL_ANALYTICS" | "RL_API" | "RL_AUTH" | "RL_SPONSOR";

interface Limit {
  /** The limiter, and the source file that must name it. */
  limiter: Binding;
  source: string;
}
interface Unlimited {
  because: string;
  none: true;
}
type Entry = Limit | Unlimited;

const RPC_HANDLER = "packages/rpc/src/handler.ts";
const LOGO = "apps/site/src/server/logo-upload.ts";
const AUDIO = "apps/site/src/server/audio.ts";
const DRAWINGS = "apps/site/src/server/teacher-drawings.ts";

/**
 * Every non-page route file (`routes/**.ts`, relative to `routes/`). Page
 * files (`*.tsx`) are the SSR pages: see `PAGES`.
 */
export const ROUTE_LIMITS: Readonly<Record<string, Entry>> = {
  "api/analytics.ts": {
    limiter: "RL_ANALYTICS",
    source: "apps/site/src/routes/api/analytics.ts",
  },
  "api/audio/$.ts": { limiter: "RL_API", source: AUDIO },
  "api/audio/upload/$.ts": { limiter: "RL_API", source: AUDIO },
  "api/auth/$.ts": {
    limiter: "RL_AUTH",
    source: "apps/site/src/server/auth-handler.ts",
  },
  "api/csp-report.ts": {
    limiter: "RL_ANALYTICS",
    source: "apps/site/src/routes/api/csp-report.ts",
  },
  "api/health.ts": {
    because:
      "liveness probe: reads the vars only, no D1, KV or session; Cloudflare's own edge limits apply",
    none: true,
  },
  "api/logos/$key.ts": {
    because:
      "admin session required; a guest has no cookie, so Better Auth answers without a D1 read (accepted, DECISIONS phase 9 task 8)",
    none: true,
  },
  "api/logos/upload.$key.ts": { limiter: "RL_SPONSOR", source: LOGO },
  "api/openapi/$.ts": {
    limiter: "RL_API",
    source: RPC_HANDLER,
  },
  "api/rpc/$.ts": { limiter: "RL_API", source: RPC_HANDLER },
  "api/sponsor-logos/$key.ts": { limiter: "RL_API", source: LOGO },
  "api/sponsor/reedit-logo.ts": { limiter: "RL_API", source: LOGO },
  "api/teacher/drawings/$.ts": { limiter: "RL_API", source: DRAWINGS },
  "api/teacher/drawings/upload/$.ts": { limiter: "RL_API", source: DRAWINGS },
  "api/webhooks/mollie.ts": {
    limiter: "RL_API",
    source: "apps/site/src/server/mollie-webhook.ts",
  },
  "api/webhooks/mux.ts": {
    limiter: "RL_API",
    source: "apps/site/src/routes/api/webhooks/mux.ts",
  },
  "dev/e2e-seed.ts": {
    because: "dev only: 404 in staging and production (`__SMOG_E2E_SEED__`)",
    none: true,
  },
  "dev/mail.ts": {
    because: "dev only: 404 in staging and production",
    none: true,
  },
  "dev/mail[.]json.ts": {
    because: "dev only: 404 in staging and production",
    none: true,
  },
  "manifest[.]webmanifest.ts": {
    because: "static JSON built from constants, no I/O",
    none: true,
  },
  "robots[.]txt.ts": {
    because: "static text, no I/O",
    none: true,
  },
  "sitemap[.]xml.ts": {
    because:
      "cached for an hour in the Cache API, so a flood reads D1 once an hour",
    none: true,
  },
  "turnstile-bridge.ts": {
    because: "a static HTML page for the app's Turnstile sheet, no I/O",
    none: true,
  },
  "webhooks/mollie.ts": {
    limiter: "RL_API",
    source: "apps/site/src/server/mollie-webhook.ts",
  },
};

/** Pages: one `RL_API` check per render, shared with the loaders' calls. */
const PAGES: Entry = {
  limiter: "RL_API",
  source: "apps/site/src/server/in-process-api.ts",
};

/**
 * Handlers that are not route files: `[where, entry]`. The maintenance
 * bypass and the Start server functions are in this table so the doc and
 * the guard name them.
 */
export const OTHER_ENDPOINTS: Readonly<Record<string, Entry>> = {
  "GET /* static assets": {
    because:
      "served by Workers Static Assets before the Worker runs; Cloudflare's edge absorbs the load",
    none: true,
  },
  "POST /_serverFn/* (theme, locale, shell reads)": {
    because:
      "Start server functions that read or set a cookie and read the shell, the language list and the published legal text (a few cached D1 reads, keyed by the enabled languages only: an unknown locale never reaches D1); the admin gate needs a session",
    none: true,
  },
  "POST /api/maintenance/bypass": {
    limiter: "RL_AUTH",
    source: "apps/site/src/worker/maintenance.ts",
  },
};

const IS_ROUTE_FILE = /\.(?:ts|tsx)$/;
const IS_PAGE = /\.tsx$/;
const SPLAT_SUFFIX = /\.(?:ts|tsx)$/;

function routeFiles(): string[] {
  return walk(ROUTES, (path) => IS_ROUTE_FILE.test(path))
    .map((path) => relative(ROUTES, path))
    .sort();
}

describe("the rate-limit table", () => {
  const files = routeFiles();
  const handlerFiles = files.filter((file) => !IS_PAGE.test(file));

  test("lists every route file (a new one needs a limiter or a reason)", () => {
    expect(handlerFiles.filter((file) => !(file in ROUTE_LIMITS))).toEqual([]);
    expect(
      Object.keys(ROUTE_LIMITS).filter((file) => !handlerFiles.includes(file))
    ).toEqual([]);
  });

  test("every row has a limiter its source uses, or a real reason", () => {
    const rows: [string, Entry][] = [
      ...Object.entries(ROUTE_LIMITS),
      ...Object.entries(OTHER_ENDPOINTS),
      ["pages", PAGES],
    ];
    for (const [name, entry] of rows) {
      if ("none" in entry) {
        expect(entry.because.trim().length, name).toBeGreaterThan(15);
      } else {
        expect(read(entry.source), name).toContain(entry.limiter);
      }
    }
  });

  test("the pages are `.tsx` and render through the in-process api", () => {
    expect(files.some((file) => IS_PAGE.test(file))).toBe(true);
    expect(read(PAGES_SOURCE)).toContain("limitRender");
  });

  test("is the table docs/API.md prints", () => {
    const doc = read("docs/API.md");
    for (const file of Object.keys(ROUTE_LIMITS)) {
      const route = file.replace(SPLAT_SUFFIX, "");
      expect(doc, file).toContain(route);
    }
  });

  test("the four bindings are the only limiters", () => {
    const bindings = new Set(
      [...Object.values(ROUTE_LIMITS), ...Object.values(OTHER_ENDPOINTS)]
        .filter((entry): entry is Limit => "limiter" in entry)
        .map((entry) => entry.limiter)
    );
    expect([...bindings].sort()).toEqual([
      "RL_ANALYTICS",
      "RL_API",
      "RL_AUTH",
      "RL_SPONSOR",
    ]);
  });
});

const PAGES_SOURCE = PAGES && "source" in PAGES ? PAGES.source : "";

// ---------------------------------------------------------------------------
// 2. The log scan
// ---------------------------------------------------------------------------

const CONSOLE_CALL = /\bconsole\.(?:debug|error|info|log|trace|warn)\s*\(/g;
const SOURCE = /\.(?:ts|tsx)$/;
const TEST_OR_FIXTURE =
  /(?:\.test\.tsx?$|\.spec\.tsx?$|\/test\/|\/testing\/|\/e2e\/|\/__fixtures__\/|\.d\.ts$)/;
/** The words of a camelCase / snake_case identifier that name a secret. */
const SENSITIVE_WORDS = new Set([
  "apikey",
  "authorization",
  "code",
  "cookie",
  "cookies",
  "email",
  "emails",
  "password",
  "secret",
  "token",
  "tokens",
]);
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
const WORD_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|[_$]+/;
const REDACTORS = ["redactMessage(", "errorSummary(", "redactReportUrl("];

/** The files the scan reads. */
function scanned(): string[] {
  const roots = [
    join(ROOT, "apps", "site", "src"),
    join(ROOT, "packages"),
    join(ROOT, "scripts"),
  ];
  return roots
    .flatMap((root) =>
      walk(root, (path) => SOURCE.test(path) && !TEST_OR_FIXTURE.test(path))
    )
    .filter((path) => !path.includes("/packages/migrate-convex/"))
    .sort();
}

/** The text between the call's parentheses, strings and comments kept. */
function callArguments(source: string, open: number): string {
  let depth = 1;
  let index = open;
  let quote: string | null = null;
  while (index < source.length && depth > 0) {
    const char = source.charAt(index);
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    index += 1;
  }
  return source.slice(open, index - 1);
}

/**
 * The code of the arguments with message strings dropped, but the
 * `${...}` expressions of a template literal kept (and a string passed to
 * a call or an index, which names what is read): what is left is what the
 * call can print.
 */
function printable(args: string): string {
  let out = "";
  let index = 0;
  while (index < args.length) {
    const char = args.charAt(index);
    if (char === '"' || char === "'") {
      const end = findStringEnd(args, index + 1, char);
      // A message string is dropped; a string that names something to read,
      // `headers.get("cookie")` or `env["SECRET"]`, is kept.
      const reads = ["(", "["].includes(out.trimEnd().slice(-1));
      out += reads ? ` ${args.slice(index + 1, end)} ` : " ";
      index = end + 1;
    } else if (char === "`") {
      const { code, end } = templateExpressions(args, index + 1);
      out += ` ${code} `;
      index = end + 1;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

function findStringEnd(text: string, from: number, quote: string): number {
  let index = from;
  while (index < text.length && text.charAt(index) !== quote) {
    index += text.charAt(index) === "\\" ? 2 : 1;
  }
  return index;
}

function templateExpressions(
  text: string,
  from: number
): { code: string; end: number } {
  let index = from;
  let code = "";
  while (index < text.length && text.charAt(index) !== "`") {
    if (text.charAt(index) === "\\") {
      index += 2;
    } else if (text.startsWith("${", index)) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < text.length && depth > 0) {
        const char = text.charAt(cursor);
        depth += char === "{" ? 1 : 0;
        depth -= char === "}" ? 1 : 0;
        cursor += 1;
      }
      code += ` ${printable(text.slice(index + 2, cursor - 1))} `;
      index = cursor;
    } else {
      index += 1;
    }
  }
  return { code, end: index };
}

/** The sensitive identifiers a call's arguments can print. */
function sensitiveNames(args: string): string[] {
  if (REDACTORS.some((redactor) => args.includes(redactor))) {
    return [];
  }
  const names: string[] = [];
  for (const [identifier] of printable(args).matchAll(IDENTIFIER)) {
    const words = identifier
      .split(WORD_BOUNDARY)
      .map((word) => word.toLowerCase());
    if (
      words.some((word) => SENSITIVE_WORDS.has(word)) ||
      identifier.toLowerCase().includes("apikey")
    ) {
      names.push(identifier);
    }
  }
  return names;
}

/** `file:identifier`, a reason each (what the identifier holds). */
const ALLOWED: Readonly<Record<string, string>> = {};

interface Finding {
  file: string;
  identifier: string;
  line: number;
}

function findings(): Finding[] {
  const found: Finding[] = [];
  for (const path of scanned()) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(CONSOLE_CALL)) {
      const open = (match.index ?? 0) + match[0].length;
      const line = source.slice(0, match.index).split("\n").length;
      for (const identifier of sensitiveNames(callArguments(source, open))) {
        found.push({ file: relative(ROOT, path), identifier, line });
      }
    }
  }
  return found;
}

describe("the log scan (no secret or personal datum in a console call)", () => {
  test("every sensitive identifier in a console call is redacted or allow-listed with a reason", () => {
    const unexplained = findings().filter(
      ({ file, identifier }) => !(`${file}:${identifier}` in ALLOWED)
    );
    expect(
      unexplained.map(
        ({ file, identifier, line }) => `${file}:${line} ${identifier}`
      )
    ).toEqual([]);
  });

  test("the allow-list has no stale entry and every entry a reason", () => {
    const live = new Set(
      findings().map(({ file, identifier }) => `${file}:${identifier}`)
    );
    expect(Object.keys(ALLOWED).filter((key) => !live.has(key))).toEqual([]);
    for (const [key, reason] of Object.entries(ALLOWED)) {
      expect(reason.trim().length, key).toBeGreaterThan(15);
    }
  });

  test("reads the whole code base (a scanner that finds no call is broken)", () => {
    let calls = 0;
    for (const path of scanned()) {
      calls += [...readFileSync(path, "utf8").matchAll(CONSOLE_CALL)].length;
    }
    expect(calls).toBeGreaterThan(150);
  });

  // The cases are source text; `@{` stands for the template placeholder.
  test("catches what it should (the scanner's own cases)", () => {
    const hit = (code: string): string[] =>
      sensitiveNames(callArguments(`${code.replaceAll("@{", "${")})`, 0));
    expect(hit("`reset for @{user.email}`")).toEqual(["email"]);
    expect(hit('"sent", token')).toEqual(["token"]);
    expect(hit('"x", { apiKey }')).toEqual(["apiKey"]);
    expect(hit("`@{request.headers.get('authorization')}`")).toEqual([
      "authorization",
    ]);
    expect(hit('"x", sessionToken')).toEqual(["sessionToken"]);
    expect(hit('"x", MAX_TOKEN_LENGTH')).toEqual(["MAX_TOKEN_LENGTH"]);
    // Strings alone, other names and the redaction helper pass.
    expect(hit('"[auth] Failed to send the email:", error')).toEqual([]);
    expect(hit('"token expired"')).toEqual([]);
    expect(hit("`@{redactMessage(error.message)} @{email}`")).toEqual([]);
    expect(hit("tokenizer, encoded")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The email consumer never logs a send failure's message
//    (the provider clients' errors are tested in
//    `apps/site/test/security-errors.test.ts`)
// ---------------------------------------------------------------------------

const CONSOLE_ERROR_MESSAGE_OF_ERROR = /console\.error\([^)]*error\.message/;

describe("the email consumer's logs", () => {
  test("a send failure is logged by name and code, never its message (it may name the recipient)", () => {
    const consumer = read("packages/jobs/src/email-consumer.ts");
    expect(consumer).toContain("error.name");
    expect(consumer).not.toMatch(CONSOLE_ERROR_MESSAGE_OF_ERROR);
  });
});
