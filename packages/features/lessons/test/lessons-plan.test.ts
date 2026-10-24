import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb } from "@smog/db/client";
import { recordingD1, scanReport } from "@smog/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { createLessonsRouter } from "../src/server";
import {
  type Authed,
  addGesture,
  contextAs,
  resetTeacherData,
  signedUp,
} from "./helpers";

/*
 * Phase 10c task 4: the lesson procedures' hot reads and writes seek an
 * index (the rule of phase 9 task 6). The real router runs against a
 * recording D1; each statement it prepared is explained with its own values.
 */

const router = createLessonsRouter() as unknown as Record<
  string,
  Parameters<typeof call>[0]
>;

let teacher: Authed;

beforeAll(async () => {
  teacher = await signedUp("teacher");
});

describe("the lessons' query plans (no full table scan)", () => {
  it("create, list (plain, mine, search, next page), get, update, readiness, markers, duplicate and delete", async () => {
    await resetTeacherData();
    const hallo = await addGesture("Plan Hallo", { published: true });
    const dag = await addGesture("Plan Dag", { published: true });
    const { d1, statements } = recordingD1(env.DB);
    const ask = async (path: string, input: unknown): Promise<unknown> =>
      await call(router[path] as Parameters<typeof call>[0], input, {
        context: await contextAs(teacher, createDb(d1)),
        path: ["lessons", path],
      });
    const created = (await ask("create", {
      locale: "nl",
      number: 1,
      title: "Plan",
    })) as { id: string };
    const stored = (await ask("get", { id: created.id })) as {
      version: number;
    };
    await ask("update", {
      expectedVersion: stored.version,
      id: created.id,
      number: 1,
      sections: [
        {
          gestureIds: [dag],
          id: crypto.randomUUID(),
          titles: { nl: "Deel" },
        },
      ],
      translations: {
        fr: { notes: "", title: "Plan" },
        nl: { notes: "x", title: "Plan" },
      },
      ungrouped: [hallo],
    });
    const page = (await ask("list", {})) as {
      items: { updatedAt: number }[];
    };
    await ask("list", { mine: true });
    await ask("list", { query: "Pla" });
    await ask("list", {
      cursor: { id: created.id, updatedAt: Date.now() },
      mine: true,
      query: "Pla",
    });
    expect(page.items.length).toBeGreaterThan(0);
    await ask("readiness", { id: created.id, locale: "fr" });
    await ask("gestureMarkers", { gestureIds: [hallo, dag] });
    const copy = (await ask("duplicate", { id: created.id })) as {
      id: string;
    };
    await ask("delete", { id: copy.id });
    await ask("delete", { id: created.id });
    expect(statements.length).toBeGreaterThan(20);

    // A multi-row insert "scans" its own VALUES list: constants, not a table.
    const report = await scanReport(env.DB, statements, (detail) =>
      detail.includes("VALUES CLAUSE")
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });
});
