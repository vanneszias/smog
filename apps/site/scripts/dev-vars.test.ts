import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DEV_BETTER_AUTH_SECRET } from "@smog/auth/env";

describe(".dev.vars.example", () => {
  test("uses the dev secret that parseAuthEnv refuses outside dev", () => {
    const source = readFileSync(
      new URL("../.dev.vars.example", import.meta.url),
      "utf8"
    );
    expect(source).toContain(`BETTER_AUTH_SECRET=${DEV_BETTER_AUTH_SECRET}\n`);
  });
});
