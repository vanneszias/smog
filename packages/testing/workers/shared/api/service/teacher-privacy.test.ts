import { isContractProcedure } from "@orpc/contract";
import {
  TEACHER_FIELD_COLUMNS,
  TEACHER_INFO_FIELDS,
} from "@smog/lessons/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { appContract } from "../../../../../api/src/contract";

/*
 * Phase 10c ruling 2: teacher information and drawings never share a table,
 * a query or an output schema with public data. This is the schema half of
 * the guard: it walks the output schema of every procedure of the app
 * contract, except the teaching namespaces (`teacher`, `lessons`, whose
 * procedures each carry a role guard and an authz row), and fails when a
 * teacher field or a drawing key appears anywhere in one, however deeply it
 * is nested (arrays, unions, optionals, records, pipes, lazies). The source
 * half (no public reader names the tables) is
 * `packages/testing/bun/shared/tooling/teacher-privacy-guard.test.ts`; the query half is
 * `packages/testing/workers/gestures/service/teacher-privacy.test.ts`.
 *
 * Extend it when a new public output appears: nothing to do for a procedure
 * under an existing namespace; a new namespace that carries teaching data
 * goes into `TEACHING_NAMESPACES` with its role guard and authz row.
 */

/** Namespaces whose procedures are role-guarded teaching procedures (Tasks 2 to 5). */
const TEACHING_NAMESPACES = new Set(["teacher", "lessons"]);

/**
 * Property names that only the teaching material uses: the seven fields (and
 * their D1 columns), the drawing and PDF keys and the aggregate objects.
 */
const FORBIDDEN_KEYS = new Set<string>([
  ...TEACHER_INFO_FIELDS,
  ...Object.values(TEACHER_FIELD_COLUMNS),
  "credit",
  "drawing",
  "drawingKey",
  "drawingPath",
  "drawings",
  "teacherInfo",
]);

interface ZodNode {
  _zod: { def: Record<string, unknown> & { type: string } };
}

function isZod(value: unknown): value is ZodNode {
  return typeof value === "object" && value !== null && "_zod" in value;
}

/** Every property name reachable in a Zod schema (object keys, through any wrapper). */
function keysOf(schema: unknown, seen = new Set<unknown>()): string[] {
  if (!isZod(schema) || seen.has(schema)) {
    return [];
  }
  seen.add(schema);
  const { def } = schema._zod;
  const children: unknown[] = [];
  const keys: string[] = [];
  switch (def.type) {
    case "object": {
      const shape = def.shape as Record<string, unknown>;
      for (const [key, child] of Object.entries(shape)) {
        keys.push(key);
        children.push(child);
      }
      children.push(def.catchall);
      break;
    }
    case "array":
      children.push(def.element);
      break;
    case "union":
      children.push(...(def.options as unknown[]));
      break;
    case "intersection":
      children.push(def.left, def.right);
      break;
    case "record":
      children.push(def.keyType, def.valueType);
      break;
    case "tuple":
      children.push(...(def.items as unknown[]), def.rest);
      break;
    case "pipe":
      children.push(def.in, def.out);
      break;
    case "lazy":
      children.push((def.getter as () => unknown)());
      break;
    case "map":
      children.push(def.keyType, def.valueType);
      break;
    case "set":
      children.push(def.valueType);
      break;
    default:
      // optional, nullable, default, readonly, catch, nonoptional, prefault, promise.
      children.push(def.innerType);
  }
  return [...keys, ...children.flatMap((child) => keysOf(child, seen))];
}

/** The forbidden property names a schema reaches. */
function forbiddenKeysIn(schema: unknown): string[] {
  return [...new Set(keysOf(schema).filter((key) => FORBIDDEN_KEYS.has(key)))];
}

/** `[path, output schema]` of every leaf procedure outside the teaching namespaces. */
function publicOutputs(
  node: unknown,
  path: string[] = []
): [string, unknown][] {
  if (isContractProcedure(node)) {
    return [[path.join("."), node["~orpc"].outputSchema]];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, child]) =>
      path.length === 0 && TEACHING_NAMESPACES.has(key)
        ? []
        : publicOutputs(child, [...path, key])
  );
}

describe("no public output schema carries teaching data", () => {
  it("the walker finds a teacher field however deeply it is nested", () => {
    const nested = z.object({
      items: z.array(
        z.union([
          z.object({ name: z.string() }),
          z.object({ extra: z.object({ cNote: z.string() }).optional() }),
        ])
      ),
    });
    expect(forbiddenKeysIn(nested)).toEqual(["cNote"]);
    expect(
      forbiddenKeysIn(z.record(z.string(), z.object({ hc: z.string() })))
    ).toEqual(["hc"]);
    expect(
      forbiddenKeysIn(
        z.object({ drawing: z.string() }).nullable().default(null)
      )
    ).toEqual(["drawing"]);
    expect(
      forbiddenKeysIn(
        z.lazy(() => z.object({ teacherInfo: z.object({ or_: z.string() }) }))
      ).sort()
    ).toEqual(["or_", "teacherInfo"]);
    // Clean schemas stay clean.
    expect(
      forbiddenKeysIn(z.object({ id: z.string(), name: z.string() }))
    ).toEqual([]);
  });

  it("an injected teacher column in a gesture output is caught", () => {
    const outputs = publicOutputs(appContract);
    expect(outputs.length).toBeGreaterThan(20);
    // The gesture detail with one teacher column injected into it.
    const detail = outputs.find(([path]) => path === "gestures.bySlug")?.[1];
    expect(detail).toBeDefined();
    expect(forbiddenKeysIn(detail)).toEqual([]);
    const injected = (detail as z.ZodObject).extend({ hc: z.string() });
    expect(forbiddenKeysIn(injected)).toEqual(["hc"]);
  });

  it("walks real schemas: the gesture detail reaches its nested keys", () => {
    const detail = publicOutputs(appContract).find(
      ([path]) => path === "gestures.bySlug"
    );
    const keys = keysOf(detail?.[1]);
    expect(keys).toContain("name");
    expect(keys).toContain("playbackId");
    expect(keys).toContain("categories");
  });

  it("no procedure outside the teaching namespaces outputs a teacher field or drawing key", () => {
    const leaks = publicOutputs(appContract).flatMap(([path, schema]) =>
      forbiddenKeysIn(schema).map((key) => `${path}: ${key}`)
    );
    expect(leaks).toEqual([]);
  });
});
