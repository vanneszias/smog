import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  main,
  parseUpdateArgs,
  planUpdate,
} from "../../../../../scripts/eas-update";

const ROOT = new URL("../../../../..", import.meta.url).pathname;
const EAS = readFileSync(join(ROOT, "apps", "mobile", "eas.json"), "utf8");

describe("parseUpdateArgs", () => {
  test("takes the profile and passes the rest through", () => {
    expect(
      parseUpdateArgs(["--", "--profile", "staging", "--message", "Fix"])
    ).toEqual({ passthrough: ["--message", "Fix"], profile: "staging" });
    expect(parseUpdateArgs(["--profile=production"])).toEqual({
      passthrough: [],
      profile: "production",
    });
  });

  test("refuses to run without a profile", () => {
    expect(() => parseUpdateArgs(["--message", "Fix"])).toThrow(
      "--profile <development|staging|production> is required"
    );
    expect(() => parseUpdateArgs(["--profile"])).toThrow("is required");
  });

  test("refuses an unknown profile", () => {
    expect(() => parseUpdateArgs(["--profile", "preview"])).toThrow(
      'unknown profile "preview"'
    );
  });

  test("refuses the flags the profile decides", () => {
    for (const flag of ["--channel", "--branch", "--environment"]) {
      expect(() =>
        parseUpdateArgs(["--profile", "staging", flag, "x"])
      ).toThrow(`${flag} comes from the profile`);
      expect(() =>
        parseUpdateArgs(["--profile", "staging", `${flag}=x`])
      ).toThrow(`${flag} comes from the profile`);
    }
  });
});

describe("planUpdate", () => {
  test("loads the profile's env and targets its channel and EAS environment", () => {
    const plan = planUpdate(EAS, {
      passthrough: ["--message", "Fix"],
      profile: "production",
    });
    expect(plan.command).toEqual([
      "eas",
      "update",
      "--channel",
      "production",
      "--environment",
      "production",
      "--message",
      "Fix",
    ]);
    // The production profile's own keys, whichever origin it builds for
    // (workers.dev or the domain, `docs/cutover-runbook.md`).
    const profile = (
      JSON.parse(EAS) as {
        build: { production: { env: Record<string, string> } };
      }
    ).build.production.env;
    expect(plan.env).toEqual({
      // The store identity: empty, so a stale shell value cannot leak in.
      APP_VARIANT: "",
      EXPO_PUBLIC_API_URL: profile.EXPO_PUBLIC_API_URL as string,
      EXPO_PUBLIC_ENVIRONMENT: "production",
      EXPO_PUBLIC_SITE_HOST: profile.EXPO_PUBLIC_SITE_HOST as string,
    });
    expect(plan.env.EXPO_PUBLIC_API_URL).toStartWith("https://");
  });

  test("maps staging to the preview EAS environment", () => {
    const plan = planUpdate(EAS, { passthrough: [], profile: "staging" });
    expect(plan.command).toEqual([
      "eas",
      "update",
      "--channel",
      "staging",
      "--environment",
      "preview",
    ]);
    expect(plan.env.EXPO_PUBLIC_API_URL).toBe(
      "https://smog-site-staging.zias.workers.dev"
    );
    // The variant is part of the runtime fingerprint (phase 9 ruling 9).
    expect(plan.env.APP_VARIANT).toBe("staging");
    expect(
      planUpdate(EAS, { passthrough: [], profile: "development" }).env
        .APP_VARIANT
    ).toBe("development");
  });

  test("refuses a profile without its channel, environment or origin keys", () => {
    const eas = JSON.parse(EAS) as {
      build: Record<string, Record<string, unknown>>;
    };
    const broken = (patch: Record<string, unknown>): string =>
      JSON.stringify({
        ...eas,
        build: { ...eas.build, staging: { ...eas.build.staging, ...patch } },
      });
    const plan = (source: string) => () =>
      planUpdate(source, { passthrough: [], profile: "staging" });
    expect(plan(broken({ channel: undefined }))).toThrow("channel");
    expect(plan(broken({ environment: undefined }))).toThrow("environment");
    expect(
      plan(broken({ env: { EXPO_PUBLIC_ENVIRONMENT: "staging" } }))
    ).toThrow("EXPO_PUBLIC_API_URL");
  });
});

describe("main", () => {
  test("runs eas with the profile's env over the process env", async () => {
    const calls: {
      command: string[];
      env: Record<string, string | undefined>;
    }[] = [];
    const code = await main(["--", "--profile", "staging", "--message", "m"], {
      baseEnv: { EXPO_PUBLIC_API_URL: "http://localhost:5173", PATH: "/bin" },
      easJson: EAS,
      log: { error: () => undefined },
      run: (command, env) => {
        calls.push({ command, env });
        return Promise.resolve(0);
      },
    });
    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command.slice(0, 6)).toEqual([
      "eas",
      "update",
      "--channel",
      "staging",
      "--environment",
      "preview",
    ]);
    expect(calls[0]?.env).toMatchObject({
      EXPO_PUBLIC_API_URL: "https://smog-site-staging.zias.workers.dev",
      EXPO_PUBLIC_ENVIRONMENT: "staging",
      EXPO_PUBLIC_SITE_HOST: "smog-site-staging.zias.workers.dev",
      PATH: "/bin",
    });
  });

  test("never runs eas without a profile, and exits 1", async () => {
    const errors: string[] = [];
    let ran = false;
    const code = await main(["--message", "m"], {
      baseEnv: {},
      easJson: EAS,
      log: { error: (line: string) => errors.push(line) },
      run: () => {
        ran = true;
        return Promise.resolve(0);
      },
    });
    expect(code).toBe(1);
    expect(ran).toBe(false);
    expect(errors.join("\n")).toContain("[easUpdate]");
  });

  test("passes eas's exit code on", async () => {
    const code = await main(["--profile", "production"], {
      baseEnv: {},
      easJson: EAS,
      log: { error: () => undefined },
      run: () => Promise.resolve(3),
    });
    expect(code).toBe(3);
  });
});
