import type {
  CommandRunner,
  WranglerEnv,
} from "../../../migrate-convex/src/cli/wrangler";

type CommandResult = Awaited<ReturnType<CommandRunner>>;
type D1Row = Record<string, unknown>;
const VALUE_NOT_FOUND = "Value not found";
function isWranglerEnv(value: string): value is WranglerEnv {
  return ["dev", "staging", "production"].includes(value);
}

/** What the fake's D1 handler is asked. */
interface FakeD1Query {
  readonly command?: string;
  readonly env: WranglerEnv;
  readonly file?: string;
  readonly remote: boolean;
}

export interface FakeWranglerOptions {
  /** Printed before stdout, as wrangler's banner or a proxy line would be. */
  readonly banner?: string;
  /**
   * Answers a `d1 execute`: one row list per statement. Throwing makes the
   * command fail with the error's message (exit 1).
   */
  readonly d1?: (query: FakeD1Query) => readonly (readonly D1Row[])[];
  /** The KV's initial keys. */
  readonly kv?: Readonly<Record<string, string>>;
  /** The secret names `secret list` prints. */
  readonly secrets?: readonly string[];
  /** Printed after stdout, as an update notice would be. */
  readonly trailer?: string;
}

export interface FakeWrangler {
  /** Every call's arguments, in order. */
  readonly calls: readonly (readonly string[])[];
  /** The KV, as the fake holds it now. */
  readonly kv: Map<string, string>;
  readonly run: CommandRunner;
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

type FakeAnswer = Promise<CommandResult>;

function answer(code: number, stdout: string, stderr = ""): FakeAnswer {
  return Promise.resolve({ code, stderr, stdout });
}

function fakeD1(
  args: readonly string[],
  query: Omit<FakeD1Query, "command" | "file">,
  options: FakeWranglerOptions,
  wrap: (stdout: string) => string
): FakeAnswer {
  try {
    const answers = options.d1?.({
      ...query,
      command: option(args, "--command"),
      file: option(args, "--file"),
    }) ?? [[]];
    const output = answers.map((results) => ({
      meta: { changes: 0, duration: 0 },
      results,
      success: true,
    }));
    return answer(0, wrap(`${JSON.stringify(output, null, 2)}\n`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return answer(1, wrap(""), `✘ [ERROR] ${message}\n`);
  }
}

function fakeKv(
  args: readonly string[],
  remote: boolean,
  kv: Map<string, string>,
  wrap: (stdout: string) => string
): FakeAnswer {
  const key = args[3] ?? "";
  if (args[2] === "put") {
    kv.set(key, args[4] ?? "");
    return answer(0, wrap(""));
  }
  const value = kv.get(key);
  if (value !== undefined) {
    return answer(0, `${value}\n`);
  }
  return remote
    ? answer(
        1,
        "",
        "✘ [ERROR] A request to the Cloudflare API failed. 404: Not Found\n"
      )
    : answer(0, `${VALUE_NOT_FOUND}\n`);
}

/**
 * A wrangler that answers `d1 execute` from `options.d1` and `kv key
 * get|put` from a map, with wrangler's output shapes: the `--json` array,
 * "Value not found" for a missing local key, a 404 failure for a missing
 * remote key. Anything else exits 1.
 */
export function createFakeWrangler(
  options: FakeWranglerOptions = {}
): FakeWrangler {
  const calls: string[][] = [];
  const kv = new Map(Object.entries(options.kv ?? {}));
  const wrap = (stdout: string): string =>
    `${options.banner ?? ""}${stdout}${options.trailer ?? ""}`;
  const run: CommandRunner = (args) => {
    calls.push([...args]);
    const env = option(args, "--env") ?? "";
    if (!isWranglerEnv(env)) {
      return answer(1, "", "fake: no --env");
    }
    if (args[0] === "secret" && args[1] === "list") {
      const list = (options.secrets ?? []).map((name) => ({
        name,
        type: "secret_text",
      }));
      return answer(0, wrap(`${JSON.stringify(list, null, 2)}\n`));
    }
    const remote = args.includes("--remote");
    if (remote === args.includes("--local")) {
      return answer(1, "", "fake: pass exactly one of --local and --remote");
    }
    const command = args.slice(0, 3).join(" ");
    if (command === "d1 execute DB") {
      return fakeD1(args, { env, remote }, options, wrap);
    }
    if (command === "kv key get" || command === "kv key put") {
      return fakeKv(args, remote, kv, wrap);
    }
    return answer(1, "", `fake: unsupported wrangler ${command}`);
  };
  return { calls, kv, run };
}
