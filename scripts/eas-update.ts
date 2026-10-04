import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `bun -F @smog/mobile update -- --profile <development|staging|production>
 * [eas update args]`: an OTA update built with the profile's origin keys.
 *
 * `eas update` does not read a build profile's `env` from `eas.json`, and
 * the origin keys (`EXPO_PUBLIC_API_URL`, `_SITE_HOST`, `_ENVIRONMENT`) live
 * only there (phase 8 ruling 3). So this loads them into the process env,
 * where Expo's CLI takes them over any `.env`, and runs
 * `eas update --channel <channel> --environment <EAS environment>` for the
 * profile. It never runs without a profile; `release-config-check` refuses
 * a package script that calls `eas update` directly.
 */

const PREFIX = "[easUpdate]";
const PROFILES = ["development", "staging", "production"] as const;
type Profile = (typeof PROFILES)[number];
/** Decided by the profile; given by hand they could mix two envs. */
const PROFILE_FLAGS = ["--channel", "--branch", "--environment"];
const ORIGIN_KEYS = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_ENVIRONMENT",
  "EXPO_PUBLIC_SITE_HOST",
];

export interface UpdateArgs {
  passthrough: string[];
  profile: Profile;
}

export interface UpdatePlan {
  command: string[];
  env: Record<string, string>;
}

type Env = Record<string, string | undefined>;
type Runner = (command: string[], env: Env) => Promise<number>;

function isProfile(value: string): value is Profile {
  return (PROFILES as readonly string[]).includes(value);
}

export function parseUpdateArgs(argv: readonly string[]): UpdateArgs {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const passthrough: string[] = [];
  let profile: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const flag = arg.split("=")[0] ?? "";
    if (flag === "--profile") {
      profile = arg.includes("=")
        ? arg.slice(arg.indexOf("=") + 1)
        : args[index + 1];
      if (!arg.includes("=")) {
        index += 1;
      }
    } else if (PROFILE_FLAGS.includes(flag)) {
      throw new Error(`${flag} comes from the profile; do not pass it`);
    } else {
      passthrough.push(arg);
    }
  }
  if (!profile) {
    throw new Error(
      `--profile <${PROFILES.join("|")}> is required (the profile's origin keys go into the update)`
    );
  }
  if (!isProfile(profile)) {
    throw new Error(
      `unknown profile "${profile}" (expected ${PROFILES.join(", ")})`
    );
  }
  return { passthrough, profile };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function planUpdate(easJson: string, args: UpdateArgs): UpdatePlan {
  const parsed: unknown = JSON.parse(easJson);
  const build = isRecord(parsed) && isRecord(parsed.build) ? parsed.build : {};
  const profile = build[args.profile];
  const at = `eas.json build.${args.profile}`;
  if (!isRecord(profile)) {
    throw new Error(`${at} is missing`);
  }
  const { channel, environment } = profile;
  if (typeof channel !== "string" || channel === "") {
    throw new Error(`${at} has no channel`);
  }
  if (typeof environment !== "string" || environment === "") {
    throw new Error(`${at} has no environment`);
  }
  const source = isRecord(profile.env) ? profile.env : {};
  const env: Record<string, string> = {};
  for (const key of ORIGIN_KEYS) {
    const value = source[key];
    if (typeof value !== "string" || value === "") {
      throw new Error(`${at}.env has no ${key}`);
    }
    env[key] = value;
  }
  return {
    command: [
      "eas",
      "update",
      "--channel",
      channel,
      "--environment",
      environment,
      ...args.passthrough,
    ],
    env,
  };
}

export async function main(
  argv: readonly string[],
  deps: {
    baseEnv: Env;
    easJson: string;
    log: { error: (line: string) => void };
    run: Runner;
  }
): Promise<number> {
  let plan: UpdatePlan;
  try {
    plan = planUpdate(deps.easJson, parseUpdateArgs(argv));
  } catch (error) {
    deps.log.error(
      `${PREFIX} ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
  return await deps.run(plan.command, { ...deps.baseEnv, ...plan.env });
}

if (import.meta.main) {
  const mobileDir = join(import.meta.dir, "..", "apps", "mobile");
  try {
    const code = await main(process.argv.slice(2), {
      baseEnv: process.env,
      easJson: readFileSync(join(mobileDir, "eas.json"), "utf8"),
      log: console,
      run: async (command, env) => {
        console.log(`${PREFIX} ${command.join(" ")}`);
        const child = Bun.spawn(command, {
          cwd: mobileDir,
          env,
          stdio: ["inherit", "inherit", "inherit"],
        });
        return await child.exited;
      },
    });
    process.exit(code);
  } catch (error) {
    console.error(`${PREFIX} Failed to run eas update:`, error);
    throw error;
  }
}
