import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { plan, type Transform } from "../src/core/plan";
import { accountTransform } from "../src/core/transform/account";
import { catalogTransform } from "../src/core/transform/catalog";
import { learningTransform } from "../src/core/transform/learning";
import { usersTransform } from "../src/core/transform/users";
import { FIXTURE_INPUTS, FIXTURE_SECRETS, fixtureExport } from "./helpers";
import { conflictProblems, NOW } from "./transform-helpers";

const SETS_ROLE = /\bSET\b[^;]*"role"/;
const ROLE_CONFLICT = /ON CONFLICT \([^)]*"role"/;
/** Task 7's transforms, in file order (task 10 lists them in `TRANSFORMS`). */
const TASK_7: readonly Transform[] = [
  usersTransform,
  catalogTransform,
  learningTransform,
  accountTransform,
];

const read = (path: string) => readFileSync(path, "utf8");

async function fixturePlan(target: "staging" | "production") {
  return plan({
    export: await fixtureExport(),
    muxMap: read(FIXTURE_INPUTS.muxMap),
    now: NOW,
    overrides: read(FIXTURE_INPUTS.overrides),
    target,
    transforms: TASK_7,
    workosUsers: read(FIXTURE_INPUTS.workosUsers),
  });
}

const printed: string[] = [];
const originals = {
  error: console.error,
  info: console.info,
  log: console.log,
  warn: console.warn,
};

beforeEach(() => {
  printed.length = 0;
  for (const name of ["error", "info", "log", "warn"] as const) {
    console[name] = (...args: unknown[]) => {
      printed.push(args.map(String).join(" "));
    };
  }
});

afterEach(() => {
  Object.assign(console, originals);
});

describe("task 7's transforms in a plan", () => {
  test("a staging plan holds no fixture address, name, token or asset id, and nothing is printed", async () => {
    const result = await fixturePlan("staging");
    expect(result.report.target).toBe("staging");
    const text = [...result.files.values(), ...printed].join("\n");
    for (const secret of FIXTURE_SECRETS) {
      expect(text).not.toContain(secret);
    }
    expect(printed).toEqual([]);
  });

  test("staging and production plans hold the same number of statements in every file", async () => {
    const staging = await fixturePlan("staging");
    const production = await fixturePlan("production");
    expect(
      staging.manifest?.files.map((file) => [file.name, file.statements])
    ).toEqual(
      production.manifest?.files.map((file) => [file.name, file.statements]) ??
        []
    );
    expect(production.report.blockers).toBe(0);
    // Production keeps the data: the WorkOS name, the share tokens.
    const productionText = [...production.files.values()].join("\n");
    expect(productionText).toContain("Adalinde Fixturova");
    expect(productionText).toContain("fixture-edit-token-0002");
    expect(printed).toEqual([]);
  });

  test("is byte-identical for the same inputs and --now", async () => {
    const first = await fixturePlan("production");
    const second = await fixturePlan("production");
    expect([...second.files]).toEqual([...first.files]);
  });

  test("names every conflict target, and no statement updates or upserts a role", async () => {
    const result = await fixturePlan("production");
    const statements = [...result.files]
      .filter(([name]) => name.endsWith(".sql") && !name.startsWith("reset"))
      .flatMap(([, content]) => content.split("\n"))
      .filter((line) => line.length > 0);
    expect(statements.length).toBeGreaterThan(50);
    expect(conflictProblems(statements)).toEqual([]);
    for (const statement of statements) {
      expect(statement).not.toMatch(SETS_ROLE);
      expect(statement).not.toMatch(ROLE_CONFLICT);
    }
    expect(
      statements.filter((statement) => statement.startsWith("UPDATE"))
    ).toHaveLength(
      result.report.sections.find((part) => part.domain === "users")?.counts
        .migrated ?? -1
    );
  });

  test("puts the users' keys and every table's keys into the reset file", async () => {
    const result = await fixturePlan("production");
    const reset = [...result.files]
      .filter(([name]) => name.startsWith("reset-imported"))
      .map(([, content]) => content)
      .join("");
    for (const table of [
      "favorite",
      "list_share",
      "list_item",
      "list",
      "consent_event",
      "audit_log",
      "gesture_keyword",
      "gesture_category",
      "gesture",
      "category",
      "user",
    ]) {
      expect(reset).toContain(`DELETE FROM "${table}" WHERE`);
    }
  });
});
