import { describe, expect, test } from "bun:test";
import {
  type CommandRunner,
  createFakeWrangler,
  createWrangler,
  parseWranglerJson,
  WranglerError,
} from "../src/cli/wrangler";

const BANNER =
  "\n ⛅️ wrangler 4.147.0\n───────────────────\n🌀 Executing on remote database DB:\n";
const TRAILER =
  "\n╭──────────────────────────╮\n│ Update available 4.148.0 │\n╰──────────────────────────╯\n";

describe("parseWranglerJson", () => {
  test("reads plain JSON and JSON between a banner and a notice", () => {
    const json =
      '[\n  {\n    "results": [{ "n": 1 }],\n    "success": true\n  }\n]';
    expect(parseWranglerJson(json)).toEqual([
      { results: [{ n: 1 }], success: true },
    ]);
    expect(parseWranglerJson(`${BANNER}${json}${TRAILER}`)).toEqual([
      { results: [{ n: 1 }], success: true },
    ]);
    expect(parseWranglerJson(`proxy: connected\n{"a":1}\n`)).toEqual({ a: 1 });
  });

  test("throws when there is no JSON", () => {
    expect(() => parseWranglerJson(`${BANNER}nothing here\n`)).toThrow(
      WranglerError
    );
    expect(() => parseWranglerJson("[ not json")).toThrow("printed no JSON");
  });
});

describe("the wrangler runner, against the fake", () => {
  test("runs d1 execute --json --command locally for dev and remotely otherwise", async () => {
    const fake = createFakeWrangler({
      banner: BANNER,
      d1: ({ command }) =>
        command?.startsWith("SELECT") ? [[{ n: 3 }]] : [[]],
      trailer: TRAILER,
    });
    const dev = createWrangler("dev", fake.run);
    const results = await dev.d1Execute({
      command: "SELECT count(*) AS n FROM user",
    });
    expect(results[0]?.results).toEqual([{ n: 3 }]);
    await createWrangler("production", fake.run).d1Execute({
      file: "/plan/10-users-001.sql",
    });
    expect(fake.calls).toEqual([
      [
        "d1",
        "execute",
        "DB",
        "--env",
        "dev",
        "--local",
        "--json",
        "--command",
        "SELECT count(*) AS n FROM user",
      ],
      [
        "d1",
        "execute",
        "DB",
        "--env",
        "production",
        "--remote",
        "--json",
        "--file",
        "/plan/10-users-001.sql",
      ],
    ]);
  });

  test("passes the file and the env to the fake's handler", async () => {
    const seen: unknown[] = [];
    const fake = createFakeWrangler({
      d1: (query) => {
        seen.push(query);
        return [[], []];
      },
    });
    const results = await createWrangler("staging", fake.run).d1Execute({
      file: "/p/a.sql",
    });
    expect(results).toHaveLength(2);
    expect(seen).toEqual([
      { command: undefined, env: "staging", file: "/p/a.sql", remote: true },
    ]);
  });

  test("names wrangler's reason on a failure, never the SQL", async () => {
    const fake = createFakeWrangler({
      d1: () => {
        throw new Error("no such table: users");
      },
    });
    const wrangler = createWrangler("staging", fake.run);
    const failure = wrangler.d1Execute({
      command: "SELECT email FROM user WHERE email = 'ada@example.test'",
    });
    await expect(failure).rejects.toThrow(
      "[migrate-convex] wrangler d1 execute --command failed on staging (exit 1): ✘ [ERROR] no such table: users"
    );
    await expect(failure).rejects.not.toThrow("ada@example.test");
  });

  test("reads wrangler's JSON error, refuses an odd shape and a failed statement", async () => {
    const answer =
      (stdout: string, code = 0): CommandRunner =>
      () =>
        Promise.resolve({ code, stderr: "", stdout });
    await expect(
      createWrangler(
        "dev",
        answer('{"error":{"text":"Authentication error [code: 10000]"}}', 1)
      ).d1Execute({ command: "SELECT 1" })
    ).rejects.toThrow("Authentication error [code: 10000]");
    await expect(
      createWrangler("dev", answer('{"rows":[]}')).d1Execute({
        command: "SELECT 1",
      })
    ).rejects.toThrow("unexpected shape");
    await expect(
      createWrangler(
        "dev",
        answer('[{"results":[],"success":false}]')
      ).d1Execute({ command: "SELECT 1" })
    ).rejects.toThrow("reported a failed statement");
    await expect(
      createWrangler("dev", answer(`${BANNER}no json at all`)).d1Execute({
        command: "SELECT 1",
      })
    ).rejects.toThrow("printed no JSON");
  });

  test("gets and puts KV keys, with a missing key as null locally and remotely", async () => {
    const fake = createFakeWrangler({
      kv: { maintenance: '{"enabled":true}' },
    });
    const dev = createWrangler("dev", fake.run);
    expect(await dev.kvGet("maintenance")).toBe('{"enabled":true}');
    expect(await dev.kvGet("catalog:version")).toBeNull();
    await dev.kvPut("catalog:version", "import-1");
    expect(fake.kv.get("catalog:version")).toBe("import-1");
    const production = createWrangler("production", fake.run);
    expect(await production.kvGet("absent")).toBeNull();
    expect(fake.calls[0]).toEqual([
      "kv",
      "key",
      "get",
      "maintenance",
      "--binding",
      "KV",
      "--env",
      "dev",
      "--local",
      "--text",
    ]);
    expect(fake.calls[2]).toEqual([
      "kv",
      "key",
      "put",
      "catalog:version",
      "import-1",
      "--binding",
      "KV",
      "--env",
      "dev",
      "--local",
    ]);
    expect(fake.calls[3]).toContain("--remote");
  });

  test("throws on a KV failure that is not a missing key", async () => {
    const denied: CommandRunner = () =>
      Promise.resolve({
        code: 1,
        stderr: "✘ [ERROR] Authentication error [code: 10000]\n",
        stdout: "",
      });
    const wrangler = createWrangler("staging", denied);
    await expect(wrangler.kvGet("maintenance")).rejects.toThrow(
      "wrangler kv key get maintenance failed on staging (exit 1): ✘ [ERROR] Authentication error [code: 10000]"
    );
    await expect(wrangler.kvPut("catalog:version", "x")).rejects.toThrow(
      "kv key put catalog:version failed"
    );
  });

  test("the fake refuses what wrangler would not run", async () => {
    const fake = createFakeWrangler();
    expect((await fake.run(["d1", "execute", "DB", "--json"])).code).toBe(1);
    expect(
      (await fake.run(["d1", "execute", "DB", "--env", "dev", "--json"])).code
    ).toBe(1);
    expect(
      (await fake.run(["queues", "list", "--env", "dev", "--local"])).code
    ).toBe(1);
  });
});
