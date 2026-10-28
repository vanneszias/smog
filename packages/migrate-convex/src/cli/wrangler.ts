/**
 * The importer's one wrangler runner (phase 8 task 5; `apply`, `mux` and
 * `we-moved` all use it). Bun only.
 *
 * - `d1 execute DB --json --command <sql>` or `--file <path>`;
 * - `kv key get <key> --text` and `kv key put <key> <value>` on the `KV`
 *   binding;
 * - `secret list --format json` (names only; `we-moved` reads which
 *   sign-in providers production has, phase 8 task 9 review);
 * - always `--env <env>`, with `--local` for `dev` and `--remote` for
 *   `staging` and `production`.
 *
 * wrangler runs from `apps/site`, whose `wrangler.jsonc` names the
 * bindings. Its stdout can carry a banner, an update notice or a proxy
 * line around the JSON, so `parseWranglerJson` finds the JSON document in
 * it. Errors name the command and wrangler's reason, never the SQL (which
 * can hold an email).
 *
 * Tests use `createFakeWrangler()`, which answers the same arguments from
 * memory; no test runs the real wrangler.
 */
import { join } from "node:path";
import { z } from "zod";

const WRANGLER_ENVS = ["dev", "staging", "production"] as const;
export type WranglerEnv = (typeof WRANGLER_ENVS)[number];

interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Runs `wrangler <args>` (the fake answers from memory). */
export type CommandRunner = (args: readonly string[]) => Promise<CommandResult>;

type D1Row = Record<string, unknown>;

/** One statement's result, as `d1 execute --json` prints it. */
interface D1Result {
  readonly meta?: Record<string, unknown>;
  readonly results: readonly D1Row[];
  readonly success: boolean;
}

const d1OutputSchema = z.array(
  z.looseObject({
    meta: z.record(z.string(), z.unknown()).optional(),
    results: z.array(z.record(z.string(), z.unknown())).default([]),
    success: z.boolean(),
  })
);

type D1Input = { readonly command: string } | { readonly file: string };

export interface Wrangler {
  /** Runs SQL on `DB`; one result per statement. Throws on a failure. */
  d1Execute: (input: D1Input) => Promise<D1Result[]>;
  readonly env: WranglerEnv;
  /** The value of `key` in `KV`, or null when there is none. */
  kvGet: (key: string) => Promise<string | null>;
  kvPut: (key: string, value: string) => Promise<void>;
  /** The names of the Worker's secrets (`secret list`; never the values). */
  secretNames: () => Promise<string[]>;
}

export class WranglerError extends Error {
  readonly code: number;
  constructor(message: string, code: number) {
    super(`[migrate-convex] ${message}`);
    this.code = code;
    this.name = "WranglerError";
  }
}

function location(env: WranglerEnv): "--local" | "--remote" {
  return env === "dev" ? "--local" : "--remote";
}

/** `wrangler d1 execute DB …` for `env` (what `apply` prints and runs). */
export function d1ExecuteArgs(env: WranglerEnv, input: D1Input): string[] {
  const source =
    "command" in input ? ["--command", input.command] : ["--file", input.file];
  return [
    "d1",
    "execute",
    "DB",
    "--env",
    env,
    location(env),
    "--json",
    ...source,
  ];
}

function kvGetArgs(env: WranglerEnv, key: string): string[] {
  return [
    "kv",
    "key",
    "get",
    key,
    "--binding",
    "KV",
    "--env",
    env,
    location(env),
    "--text",
  ];
}

/** `wrangler kv key put …` on `KV` for `env`. */
export function kvPutArgs(
  env: WranglerEnv,
  key: string,
  value: string
): string[] {
  return [
    "kv",
    "key",
    "put",
    key,
    value,
    "--binding",
    "KV",
    "--env",
    env,
    location(env),
  ];
}

const JSON_START = /^\s*[[{]/;

/**
 * The JSON document in wrangler's stdout: the whole text if it parses,
 * otherwise the longest run of lines that starts with `[` or `{` and
 * parses (so a banner before it, or a notice after it, is skipped).
 * Throws when there is none.
 */
export function parseWranglerJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Look for the document between other lines.
  }
  const lines = stdout.split("\n");
  for (let start = 0; start < lines.length; start += 1) {
    if (!JSON_START.test(lines[start] ?? "")) {
      continue;
    }
    for (let end = lines.length; end > start; end -= 1) {
      const candidate = lines.slice(start, end).join("\n").trim();
      try {
        return JSON.parse(candidate);
      } catch {
        // A shorter run may parse.
      }
    }
  }
  throw new WranglerError(
    "wrangler printed no JSON where JSON was expected",
    1
  );
}

const QUOTED_TEXT = /(["'`])(?:(?!\1).)*\1/g;
const ADDRESS_LIKE = /\S+@\S+/g;

/**
 * Wrangler's text with quoted fragments and address-like words masked: a D1
 * syntax or constraint error can quote part of the SQL, which may hold an
 * address, and the importer never logs one (runbook section 9).
 */
function scrub(text: string): string {
  return text
    .replace(QUOTED_TEXT, (_match, quote: string) => `${quote}…${quote}`)
    .replace(ADDRESS_LIKE, "…");
}

/** wrangler's own reason for a failure: its JSON error text, or the last line it printed (quoted text masked). */
function failureReason(result: CommandResult): string {
  try {
    const parsed = parseWranglerJson(result.stdout) as {
      error?: { text?: unknown };
    } | null;
    if (typeof parsed?.error?.text === "string") {
      return scrub(parsed.error.text);
    }
  } catch {
    // Not JSON: use the text.
  }
  const lines = `${result.stderr}\n${result.stdout}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return scrub(lines.at(-1) ?? "no output");
}

/**
 * A missing key on the remote KV: the API's "key not found" (code 10009) or
 * its 404 answer. Nothing broader: "namespace not found", a missing binding
 * or a shell's "command not found" must throw, not read as a missing key.
 */
const KEY_NOT_FOUND = /\[code: 10009\]|\b404: Not Found\b/;
const VALUE_NOT_FOUND = "Value not found";
const FINAL_NEWLINE = /\n$/;

/** The importer's wrangler for `env`, over `run` (the real one by default). */
export function createWrangler(
  env: WranglerEnv,
  run: CommandRunner = bunxWrangler
): Wrangler {
  return {
    async d1Execute(input) {
      const what =
        "command" in input ? "d1 execute --command" : "d1 execute --file";
      const result = await run(d1ExecuteArgs(env, input));
      if (result.code !== 0) {
        throw new WranglerError(
          `wrangler ${what} failed on ${env} (exit ${result.code}): ${failureReason(result)}`,
          result.code
        );
      }
      const parsed = d1OutputSchema.safeParse(parseWranglerJson(result.stdout));
      if (!parsed.success) {
        throw new WranglerError(
          `wrangler ${what} on ${env} printed JSON of an unexpected shape`,
          1
        );
      }
      if (parsed.data.some((statement) => !statement.success)) {
        throw new WranglerError(
          `wrangler ${what} on ${env} reported a failed statement`,
          1
        );
      }
      return parsed.data;
    },
    env,
    async kvGet(key) {
      const result = await run(kvGetArgs(env, key));
      if (result.code !== 0) {
        if (KEY_NOT_FOUND.test(`${result.stderr}\n${result.stdout}`)) {
          return null;
        }
        throw new WranglerError(
          `wrangler kv key get ${key} failed on ${env} (exit ${result.code}): ${failureReason(result)}`,
          result.code
        );
      }
      const value = result.stdout.replace(FINAL_NEWLINE, "");
      return value.trim() === VALUE_NOT_FOUND ? null : value;
    },
    async kvPut(key, value) {
      const result = await run(kvPutArgs(env, key, value));
      if (result.code !== 0) {
        throw new WranglerError(
          `wrangler kv key put ${key} failed on ${env} (exit ${result.code}): ${failureReason(result)}`,
          result.code
        );
      }
    },
    async secretNames() {
      const result = await run([
        "secret",
        "list",
        "--env",
        env,
        "--format",
        "json",
      ]);
      if (result.code !== 0) {
        throw new WranglerError(
          `wrangler secret list failed on ${env} (exit ${result.code}): ${failureReason(result)}`,
          result.code
        );
      }
      const parsed = secretListSchema.safeParse(
        parseWranglerJson(result.stdout)
      );
      if (!parsed.success) {
        throw new WranglerError(
          `wrangler secret list on ${env} printed JSON of an unexpected shape`,
          1
        );
      }
      return parsed.data.map((secret) => secret.name).sort();
    },
  };
}

const secretListSchema = z.array(z.looseObject({ name: z.string() }));

const SITE_DIR = join(import.meta.dir, "..", "..", "..", "..", "apps", "site");

/** The real runner: `bunx wrangler <args>` in `apps/site`, without colour. */
const bunxWrangler: CommandRunner = async (args) => {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["bunx", "wrangler", ...args], {
      cwd: SITE_DIR,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stderr: "pipe",
      stdout: "pipe",
    });
  } catch (error) {
    // Not installed: the shell's "command not found".
    return { code: 127, stderr: String(error), stdout: "" };
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
};
