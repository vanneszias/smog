import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/*
 * The turbo bypass (phase 9 ruling 12): `bun -F @smog/site deploy` builds
 * the workspace packages `@smog/site` depends on through turbo first (a
 * no-op today: none of them has a build step), then runs the existing
 * `vite build`, the deploy guard and `wrangler deploy`, in that order.
 */

const SITE_DIR = new URL("..", import.meta.url).pathname;
const TURBO_STEP = "turbo run build --filter=@smog/site^...";

function scripts(): Record<string, string | undefined> {
  const parsed = JSON.parse(
    readFileSync(`${SITE_DIR}/package.json`, "utf8")
  ) as { scripts: Record<string, string | undefined> };
  return parsed.scripts;
}

function steps(script: string | undefined): string[] {
  return (script ?? "").split("&&").map((step) => step.trim());
}

describe("deploy scripts", () => {
  it("deploy runs the turbo build of its dependencies, then vite build, the guard and wrangler deploy, in that order", () => {
    expect(steps(scripts().deploy)).toEqual([
      TURBO_STEP,
      "vite build",
      "bun scripts/deploy-guard.ts",
      "wrangler deploy --env $CLOUDFLARE_ENV",
    ]);
  });

  it("deploy:dry goes through deploy, so the staging dry run starts turbo too", () => {
    const dry = scripts()["deploy:dry"] ?? "";
    expect(dry).toContain("bun run deploy ");
    expect(dry).toContain("--dry-run");
    expect(dry).not.toContain("--containers-rollout");
  });

  it("the turbo step exits 0, whether or not a dependency has a build task", async () => {
    const run = Bun.spawn(
      ["bunx", "turbo", ...TURBO_STEP.split(" ").slice(1)],
      {
        cwd: SITE_DIR,
        env: {
          ...process.env,
          TURBO_NO_UPDATE_NOTIFIER: "1",
          TURBO_TELEMETRY_DISABLED: "1",
        },
        stderr: "pipe",
        stdout: "pipe",
      }
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ]);
    if (code !== 0) {
      console.error(`${stdout}\n${stderr}`);
    }
    expect(code).toBe(0);
  }, 60_000);
});
